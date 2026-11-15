import type pg from 'pg';
import { ingestFile, PermanentError, type IngestDeps } from './pipeline.js';

export const MAX_ATTEMPTS = 3;
const STALE_LOCK = "interval '15 minutes'";

type Job = { id: string; file_id: string; attempts: number };

/**
 * Claims the next runnable job: queued and due, or running with a lock older than 15 min (its worker died).
 * SKIP LOCKED lets several workers poll without blocking each other. Bumps attempts on claim.
 */
export async function claimJob(pool: pg.Pool): Promise<Job | undefined> {
  const result = await pool.query<Job>(
    `UPDATE jobs SET status = 'running', locked_at = now(), attempts = attempts + 1
     WHERE id = (
       SELECT id FROM jobs
       WHERE (status = 'queued' AND run_after <= now())
          OR (status = 'running' AND locked_at < now() - ${STALE_LOCK})
       ORDER BY run_after, id
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING id, file_id, attempts`,
  );
  return result.rows[0];
}

/** Retry delay after the given attempt: 30 s, 2 min, … */
export const backoffSeconds = (attempt: number) => 30 * 4 ** Math.max(0, attempt - 1);

export async function recordFailure(pool: pg.Pool, job: Job, error: unknown) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
  const final = error instanceof PermanentError || job.attempts >= MAX_ATTEMPTS;
  if (final) {
    await pool.query(`UPDATE jobs SET status = 'failed', locked_at = NULL, last_error = $2 WHERE id = $1`, [
      job.id,
      message,
    ]);
    await pool.query(`UPDATE files SET status = 'failed', error = $2 WHERE id = $1`, [job.file_id, message]);
  } else {
    await pool.query(
      `UPDATE jobs SET status = 'queued', locked_at = NULL, last_error = $2,
         run_after = now() + make_interval(secs => $3) WHERE id = $1`,
      [job.id, message, backoffSeconds(job.attempts)],
    );
    // The file stays 'processing' while a retry is pending; the error explains the delay.
    await pool.query(`UPDATE files SET error = $2 WHERE id = $1`, [job.file_id, `Retrying: ${message}`]);
  }
}

export type Worker = { stop: () => Promise<void> };

/**
 * Starts `concurrency` polling loops. stop() lets each loop finish its current piece, puts an interrupted
 * job back in the queue without spending an attempt, and resolves when all loops have exited.
 */
export function startWorker(deps: IngestDeps, options: { concurrency: number; pollMs?: number }): Worker {
  let stopping = false;
  const sleepers = new Set<() => void>();
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        sleepers.delete(done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      sleepers.add(done);
    });

  async function runOne(job: Job) {
    const heartbeat = async () => {
      await deps.pool.query('UPDATE jobs SET locked_at = now() WHERE id = $1', [job.id]);
    };
    try {
      const outcome = await ingestFile(deps, job.id, job.file_id, heartbeat, () => stopping);
      if (outcome === 'stopped') {
        await deps.pool.query(
          `UPDATE jobs SET status = 'queued', locked_at = NULL, attempts = attempts - 1 WHERE id = $1`,
          [job.id],
        );
        return;
      }
      await deps.pool.query(
        `UPDATE jobs SET status = 'done', locked_at = NULL, last_error = NULL WHERE id = $1`,
        [job.id],
      );
    } catch (error) {
      console.error(`ingest job ${job.id} failed (attempt ${job.attempts})`, String(error));
      await recordFailure(deps.pool, job, error).catch((e) => console.error('could not record failure', e));
    }
  }

  async function loop() {
    while (!stopping) {
      let job: Job | undefined;
      try {
        job = await claimJob(deps.pool);
      } catch (error) {
        console.error('job claim failed', String(error));
      }
      if (job) await runOne(job);
      else await sleep(options.pollMs ?? 3000);
    }
  }

  const loops = Array.from({ length: Math.max(1, options.concurrency) }, () => loop());
  return {
    stop: async () => {
      stopping = true;
      for (const wake of [...sleepers]) wake();
      await Promise.all(loops);
    },
  };
}

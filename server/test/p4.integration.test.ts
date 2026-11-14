import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPool } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';
import { createR2 } from '../src/lib/r2.js';
import { FakeProvider } from '../src/agent/provider/fake.js';
import { ingestFile, type IngestDeps } from '../src/ingest/pipeline.js';
import { claimJob, recordFailure, startWorker } from '../src/ingest/worker.js';
import { filePrefix } from '../src/services/files.js';

const testUrl = process.env.TEST_DATABASE_URL;
const ready = Boolean(testUrl && process.env.R2_ACCOUNT_ID && process.env.R2_SECRET_ACCESS_KEY);

const ffmpeg = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', ...args, '-f', 'mp4', 'pipe:1']);

describe.skipIf(!ready)('P4 ingestion on test database and R2', () => {
  if (testUrl === process.env.DATABASE_URL)
    throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL');
  const pool = createPool(testUrl!);
  const storage = createR2();
  // Embeddings are stubbed (free-tier quota); the real client is covered by P3's live spike.
  const embed = vi.fn(async () => Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0)));
  const describer = new FakeProvider({});
  vi.spyOn(describer, 'capabilities').mockReturnValue({
    input: { image: true, pdf: true, audio: true, video: true },
    tools: false,
    reasoning: false,
    maxMediaPartsPerRequest: 1,
  });
  vi.spyOn(describer, 'describe').mockImplementation(async ({ pieces }) =>
    pieces.map((p) => ({ summary: `a ${p.type}`, transcript: '', visible_text: '', tags: [p.type] })),
  );
  const deps: IngestDeps = {
    pool,
    storage,
    embedText: embed,
    embedMedia: embed,
    describer: { provider: describer, model: 'fake' },
    audioPieceSec: 2,
    describeBatch: 2,
  };
  let userId = '';
  let collectionId = '';

  async function upload(name: string, mime: string, modality: string, bytes: Buffer) {
    const id = randomUUID();
    const key = `${filePrefix(userId, id)}original`;
    await storage.put(key, bytes, mime);
    await pool.query(
      `INSERT INTO files(id,user_id,collection_id,name,mime_type,modality,size_bytes,r2_key,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'queued')`,
      [id, userId, collectionId, name, mime, modality, bytes.length, key],
    );
    const job = await pool.query<{ id: string }>('INSERT INTO jobs(file_id) VALUES ($1) RETURNING id', [id]);
    return { fileId: id, jobId: job.rows[0].id };
  }
  const file = async (id: string) =>
    (await pool.query('SELECT status, pieces_total, pieces_done, error FROM files WHERE id = $1', [id]))
      .rows[0];
  const chunks = async (id: string) =>
    (await pool.query('SELECT * FROM chunks WHERE file_id = $1 ORDER BY seq', [id])).rows;

  beforeAll(async () => {
    await migrate(pool);
    // Park jobs left by other suites so the claim tests only see ours.
    await pool.query(`UPDATE jobs SET status = 'done' WHERE status IN ('queued','running')`);
    userId = (
      await pool.query('INSERT INTO users(email) VALUES ($1) RETURNING id', [
        `p4-${randomUUID()}@example.com`,
      ])
    ).rows[0].id;
    collectionId = (
      await pool.query('INSERT INTO collections(user_id,name) VALUES ($1,$2) RETURNING id', [userId, 'P4'])
    ).rows[0].id;
  }, 60000);
  afterAll(async () => {
    try {
      await storage.deletePrefix(`users/${userId}/`);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    } finally {
      await pool.end();
    }
  }, 60000);

  it('ingests text, image, PDF, audio and video to ready with chunks and thumbnails', async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (const word of ['alpha', 'beta']) pdf.addPage().drawText(word, { x: 50, y: 700, font, size: 24 });
    const inputs = [
      await upload('notes.txt', 'text/plain', 'text', Buffer.from('word '.repeat(1500))),
      await upload(
        'red.png',
        'image/png',
        'image',
        await sharp({ create: { width: 64, height: 64, channels: 3, background: 'red' } })
          .png()
          .toBuffer(),
      ),
      await upload('two.pdf', 'application/pdf', 'pdf', Buffer.from(await pdf.save())),
      await upload(
        'tone.mp3',
        'audio/mpeg',
        'audio',
        execFileSync('ffmpeg', [
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          'sine=duration=5',
          '-f',
          'mp3',
          'pipe:1',
        ]),
      ),
      await upload(
        'clip.mp4',
        'video/mp4',
        'video',
        ffmpeg([
          '-f',
          'lavfi',
          '-i',
          'testsrc=duration=2:size=320x240:rate=10',
          '-f',
          'lavfi',
          '-i',
          'sine=duration=2',
          '-shortest',
          '-pix_fmt',
          'yuv420p',
          '-movflags',
          'frag_keyframe+empty_moov',
        ]),
      ),
    ];
    const worker = startWorker(deps, { concurrency: 1, pollMs: 200 });
    try {
      for (let i = 0; i < 300; i++) {
        const states = await Promise.all(inputs.map((x) => file(x.fileId)));
        if (states.every((s) => s.status === 'ready' || s.status === 'failed')) break;
        await new Promise((r) => setTimeout(r, 500));
      }
    } finally {
      await worker.stop();
    }
    const [text, image, pdfFile, audio, video] = inputs;
    for (const x of inputs) expect(await file(x.fileId)).toMatchObject({ status: 'ready', error: null });

    const textChunks = await chunks(text.fileId);
    expect(textChunks.length).toBe(3); // 7500 chars, 3200-char pieces, 400 overlap
    expect(textChunks[0]).toMatchObject({ char_start: 0, char_end: 3200, summary: null });
    expect(textChunks[0].visible_text).toContain('word');

    const pages = await chunks(pdfFile.fileId);
    expect(pages.map((c) => c.page)).toEqual([1, 2]);
    expect(pages[0].thumb_r2_key).toMatch(/thumbs\/0\.jpg$/);
    expect((await storage.head(pages[0].thumb_r2_key)).ContentType).toBe('image/jpeg');

    const audioChunks = await chunks(audio.fileId);
    expect(audioChunks.map((c) => c.start_sec)).toEqual([0, 2, 4]);
    expect(audioChunks.map((c) => c.end_sec).slice(0, 2)).toEqual([2, 4]);
    expect(audioChunks[2].end_sec).toBeCloseTo(5, 0); // encoder padding makes the tone ~5.04 s
    expect((await chunks(image.fileId))[0].summary).toBe('a image');
    const [videoChunk] = await chunks(video.fileId);
    expect(videoChunk).toMatchObject({ modality: 'video', start_sec: 0 });
    expect((await storage.head(videoChunk.r2_key)).ContentType).toBe('video/mp4');
    expect(await file(audio.fileId)).toMatchObject({ pieces_total: 3, pieces_done: 3 });
  }, 240000);

  it('reclaims a stale running job and finishes without duplicate chunks', async () => {
    const { fileId, jobId } = await upload('again.txt', 'text/plain', 'text', Buffer.from('x '.repeat(3000)));
    // Simulate a worker that died after storing the first piece.
    await ingestFile(
      { ...deps, describeBatch: 1 },
      jobId,
      fileId,
      async () => {},
      (() => {
        let calls = 0;
        return () => calls++ > 0;
      })(),
    );
    expect((await chunks(fileId)).length).toBe(1);
    await pool.query(
      `UPDATE jobs SET status = 'running', attempts = 1, locked_at = now() - interval '20 minutes' WHERE id = $1`,
      [jobId],
    );
    const claimed = await claimJob(pool);
    expect(claimed).toMatchObject({ id: jobId, attempts: 2 });
    await ingestFile(
      deps,
      jobId,
      fileId,
      async () => {},
      () => false,
    );
    const rows = await chunks(fileId);
    expect(rows.map((c) => c.seq)).toEqual([0, 1]);
    expect(await file(fileId)).toMatchObject({ status: 'ready', pieces_done: 2 });
    await pool.query(`UPDATE jobs SET status = 'done' WHERE id = $1`, [jobId]);
  }, 60000);

  it('retries transient errors with backoff and fails bad files at once', async () => {
    await pool.query(`UPDATE jobs SET status = 'done' WHERE status IN ('queued','running')`);
    const { fileId, jobId } = await upload('soon.txt', 'text/plain', 'text', Buffer.from('hi'));
    const job = await claimJob(pool);
    expect(job?.id).toBe(jobId);
    await recordFailure(pool, job!, new Error('embedding 503'));
    const retry = (
      await pool.query(`SELECT status, run_after > now() AS later, last_error FROM jobs WHERE id = $1`, [
        jobId,
      ])
    ).rows[0];
    expect(retry).toMatchObject({ status: 'queued', later: true, last_error: 'embedding 503' });
    expect((await file(fileId)).status).toBe('queued');

    const broken = await upload('broken.pdf', 'application/pdf', 'pdf', Buffer.from('not a pdf'));
    await pool.query(`UPDATE jobs SET run_after = now() + interval '1 hour' WHERE id = $1`, [jobId]);
    const worker = startWorker(deps, { concurrency: 1, pollMs: 200 });
    try {
      for (let i = 0; i < 60 && (await file(broken.fileId)).status !== 'failed'; i++)
        await new Promise((r) => setTimeout(r, 500));
    } finally {
      await worker.stop();
    }
    expect(await file(broken.fileId)).toMatchObject({ status: 'failed' });
    expect((await file(broken.fileId)).error).toMatch(/Could not read this file/);
    const attempts = (await pool.query('SELECT attempts, status FROM jobs WHERE id = $1', [broken.jobId]))
      .rows[0];
    expect(attempts).toEqual({ attempts: 1, status: 'failed' });
  }, 60000);
});

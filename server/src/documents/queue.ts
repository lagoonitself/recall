import { analyzeDocument, isDocumentCandidate, markPending, type DocDeps } from './analyze.js';

type Task = { fileId: string; crossOnly: boolean };

/**
 * In-process queue for document analysis (D30). One task at a time keeps memory and Gemini quota in check on the
 * 512 MB Render instance. State lives in doc_insights, so a restart loses nothing: `resume()` re-queues rows left
 * 'pending' or 'running'.
 */
export class DocumentQueue {
  private readonly tasks: Task[] = [];
  private running = false;
  private idleWaiters: (() => void)[] = [];
  constructor(private readonly deps: DocDeps) {}

  enqueue(fileId: string, crossOnly = false) {
    const existing = this.tasks.find((t) => t.fileId === fileId);
    if (existing)
      existing.crossOnly &&= crossOnly; // A full run covers a cross-only one.
    else this.tasks.push({ fileId, crossOnly });
    void this.drain();
  }

  /** Called by the ingest worker when a file finishes processing. */
  async fileReady(fileId: string) {
    const found = await this.deps.pool.query<{ collection_id: string; modality: string }>(
      'SELECT collection_id, modality FROM files WHERE id = $1',
      [fileId],
    );
    const file = found.rows[0];
    if (!file) return;
    if (isDocumentCandidate(file.modality)) {
      await markPending(this.deps.pool, fileId);
      this.enqueue(fileId);
    }
    // New evidence: refresh the cross-media checks of the other documents in the collection.
    const others = await this.deps.pool.query<{ file_id: string }>(
      `SELECT file_id FROM doc_insights WHERE collection_id = $1 AND status = 'ready' AND file_id <> $2
       ORDER BY updated_at DESC LIMIT 10`,
      [file.collection_id, fileId],
    );
    for (const row of others.rows) this.enqueue(row.file_id, true);
  }

  async resume() {
    const rows = await this.deps.pool.query<{ file_id: string }>(
      `SELECT file_id FROM doc_insights WHERE status IN ('pending','running') ORDER BY updated_at`,
    );
    for (const row of rows.rows) this.enqueue(row.file_id);
  }

  /** Resolves when the queue is empty (tests). */
  idle() {
    return this.running || this.tasks.length
      ? new Promise<void>((resolve) => this.idleWaiters.push(resolve))
      : Promise.resolve();
  }

  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      for (let task = this.tasks.shift(); task; task = this.tasks.shift()) {
        try {
          await analyzeDocument(this.deps, task.fileId, { crossOnly: task.crossOnly });
        } catch (error) {
          console.error('document queue task failed', String(error));
        }
      }
    } finally {
      this.running = false;
      for (const wake of this.idleWaiters.splice(0)) wake();
    }
  }
}

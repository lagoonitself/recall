import type { Response } from 'express';
import { SseEventSchema, type SseEvent } from '@app/shared';

/**
 * Server-Sent Events writer for the chat stream (ARCHITECTURE §8).
 * Every event is validated against the shared schema before it is written, so the client never sees an
 * event its parser would reject. A `: ping` comment goes out every 15 s to keep proxies from closing the
 * connection. `closed` turns true when the client disconnects; writes after that are dropped.
 */
export class SseWriter {
  private heartbeat: NodeJS.Timeout | undefined;
  private isClosed = false;
  readonly abort = new AbortController();

  constructor(
    private readonly res: Response,
    heartbeatMs = 15_000,
  ) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.socket?.setNoDelay(true);
    this.heartbeat = setInterval(() => this.raw(': ping\n\n'), heartbeatMs);
    this.heartbeat.unref();
    res.on('close', () => {
      if (!res.writableEnded) this.abort.abort();
      this.stop();
    });
  }

  get closed() {
    return this.isClosed;
  }

  send(event: SseEvent) {
    const parsed = SseEventSchema.parse(event);
    this.raw(`event: ${parsed.event}\ndata: ${JSON.stringify(parsed.data)}\n\n`);
  }

  end() {
    this.stop();
    if (!this.res.writableEnded) this.res.end();
  }

  private raw(text: string) {
    if (this.isClosed || this.res.writableEnded) return;
    this.res.write(text);
  }

  private stop() {
    this.isClosed = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = undefined;
  }
}

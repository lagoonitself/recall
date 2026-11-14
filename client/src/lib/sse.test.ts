import { describe, it, expect } from 'vitest';
import { parseSseStream } from './sse';
import type { SseEvent } from '@app/shared';

function createStreamFromChunks(chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        if (typeof chunk === 'string') {
          controller.enqueue(encoder.encode(chunk));
        } else {
          controller.enqueue(chunk);
        }
      }
      controller.close();
    },
  });
}

describe('parseSseStream', () => {
  it('parses standard SSE events', async () => {
    const raw =
      'event: step.start\n' +
      'data: {"seq":1,"kind":"reasoning"}\n\n' +
      'event: reasoning.delta\n' +
      'data: {"seq":1,"text":"Thinking..."}\n\n';

    const events: SseEvent[] = [];
    for await (const ev of parseSseStream(createStreamFromChunks([raw]))) {
      events.push(ev);
    }

    expect(events).toEqual([
      { event: 'step.start', data: { seq: 1, kind: 'reasoning' } },
      { event: 'reasoning.delta', data: { seq: 1, text: 'Thinking...' } },
    ]);
  });

  it('handles split chunks across arbitrary byte boundaries', async () => {
    const chunks = [
      'ev',
      'ent: step.st',
      'art\nda',
      'ta: {"seq":1,"kind":"tool_ca',
      'll"}\n',
      '\n',
      'event: tool.call\ndata: {"seq":1,"name":"search_library","args":{"query":"test"}}\n\n',
    ];

    const events: SseEvent[] = [];
    for await (const ev of parseSseStream(createStreamFromChunks(chunks))) {
      events.push(ev);
    }

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ event: 'step.start', data: { seq: 1, kind: 'tool_call' } });
    expect(events[1]).toEqual({
      event: 'tool.call',
      data: { seq: 1, name: 'search_library', args: { query: 'test' } },
    });
  });

  it('handles multi-line data joined by newline', async () => {
    const raw =
      'event: tool.result\n' +
      'data: {\n' +
      'data:   "seq": 2,\n' +
      'data:   "name": "search_library",\n' +
      'data:   "summary": "found 1 item",\n' +
      'data:   "items": ["result1"]\n' +
      'data: }\n\n';

    const events: SseEvent[] = [];
    for await (const ev of parseSseStream(createStreamFromChunks([raw]))) {
      events.push(ev);
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      event: 'tool.result',
      data: {
        seq: 2,
        name: 'search_library',
        summary: 'found 1 item',
        items: ['result1'],
      },
    });
  });

  it('filters out comment and heartbeat lines starting with :', async () => {
    const raw =
      ': ping\n' +
      ': another comment\n\n' +
      ':\n' +
      'event: answer.delta\n' +
      ': heartbeat between fields\n' +
      'data: {"text":"Hello world"}\n\n' +
      ': trailing ping\n';

    const events: SseEvent[] = [];
    for await (const ev of parseSseStream(createStreamFromChunks([raw]))) {
      events.push(ev);
    }

    expect(events).toEqual([{ event: 'answer.delta', data: { text: 'Hello world' } }]);
  });

  it('aborts cleanly when AbortController triggers', async () => {
    const controller = new AbortController();
    const encoder = new TextEncoder();

    // Stream that keeps enqueuing until aborted
    const stream = new ReadableStream<Uint8Array>({
      start(ctrl) {
        ctrl.enqueue(encoder.encode('event: step.start\ndata: {"seq":1,"kind":"reasoning"}\n\n'));
      },
    });

    const events: SseEvent[] = [];
    for await (const ev of parseSseStream(stream, controller.signal)) {
      events.push(ev);
      controller.abort();
    }

    expect(events).toEqual([{ event: 'step.start', data: { seq: 1, kind: 'reasoning' } }]);
  });

  it('parses the full chat-demo.sse fixture matching shared event schemas', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const fixturePath = path.resolve(__dirname, '../mocks/fixtures/chat-demo.sse');
    const content = fs.readFileSync(fixturePath, 'utf-8');

    const events: SseEvent[] = [];
    for await (const ev of parseSseStream(createStreamFromChunks([content]))) {
      events.push(ev);
    }

    expect(events.length).toBeGreaterThan(10);
    expect(events[0].event).toBe('step.start');
    expect((events[0] as { data: { kind: string } }).data.kind).toBe('reasoning');

    const doneEvent = events.find((e) => e.event === 'done');
    expect(doneEvent).toBeDefined();

    const sourcesEvent = events.find((e) => e.event === 'sources');
    expect(sourcesEvent).toBeDefined();
  });
});

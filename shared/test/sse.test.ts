import { describe, expect, it } from 'vitest';
import { SseEventSchema } from '../src/index.js';
const id = '00000000-0000-4000-8000-000000000001';
const examples = [
  { event: 'step.start', data: { seq: 0, kind: 'reasoning' } },
  { event: 'reasoning.delta', data: { seq: 0, text: 'Thinking' } },
  { event: 'tool.call', data: { seq: 1, name: 'search_library', args: { query: 'test' } } },
  { event: 'tool.result', data: { seq: 1, name: 'search_library', summary: 'Found', items: [] } },
  { event: 'step.end', data: { seq: 1, ms: 10 } },
  { event: 'answer.delta', data: { text: 'Answer' } },
  {
    event: 'sources',
    data: [
      { sid: 'S1', chunkId: id, fileName: 'a.pdf', modality: 'pdf', location: { page: 1 }, thumbUrl: null },
    ],
  },
  { event: 'done', data: { messageId: id } },
  { event: 'error', data: { message: 'Failed' } },
];
describe('SSE contract', () => {
  it.each(examples)('parses $event', (example) => expect(SseEventSchema.parse(example)).toEqual(example));
});

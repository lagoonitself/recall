import type { SseEvent } from '@app/shared';
export const recordedSseFixture: SseEvent[] = [
  { event: 'step.start', data: { seq: 0, kind: 'reasoning' } },
  { event: 'reasoning.delta', data: { seq: 0, text: 'Searching the library.' } },
  { event: 'step.end', data: { seq: 0, ms: 1 } },
  { event: 'step.start', data: { seq: 1, kind: 'tool_call' } },
  { event: 'tool.call', data: { seq: 1, name: 'search_library', args: { query: 'cats' } } },
  { event: 'step.end', data: { seq: 1, ms: 1 } },
  { event: 'answer.delta', data: { text: 'Found a cat.' } },
  { event: 'sources', data: [] },
  { event: 'done', data: { messageId: '00000000-0000-4000-8000-000000000001' } },
];

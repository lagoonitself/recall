import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collect } from './contract.js';
import { GeminiProvider } from './gemini.js';

const mocks = vi.hoisted(() => ({ stream: vi.fn(), generate: vi.fn() }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContentStream: mocks.stream, generateContent: mocks.generate };
  },
}));
beforeEach(() => vi.resetAllMocks());
const input = { model: 'model', system: 'system', messages: [], tools: [] };

describe('Gemini adapter', () => {
  it('streams thoughts and calls and round trips opaque parts', async () => {
    const signature = 'opaque-signature';
    const part = { functionCall: { name: 'search', args: { query: 'cat' } }, thoughtSignature: signature };
    mocks.stream.mockResolvedValueOnce(
      (async function* () {
        yield {
          candidates: [
            { content: { parts: [{ text: 'thinking', thought: true }, part] }, finishReason: 'STOP' },
          ],
        };
      })(),
    );
    mocks.stream.mockResolvedValueOnce(
      (async function* () {
        yield { candidates: [{ content: { parts: [{ text: 'answer' }] }, finishReason: 'STOP' }] };
      })(),
    );
    const provider = new GeminiProvider('key', 2);
    const events = await collect(provider.streamTurn(input));
    expect(events).toContainEqual({ type: 'reasoning.delta', text: 'thinking' });
    expect(events).toContainEqual({
      type: 'tool_call',
      id: 'call-0',
      name: 'search',
      args: { query: 'cat' },
    });
    const end = events.at(-1);
    if (end?.type !== 'turn.end') throw new Error('missing turn end');
    await collect(
      provider.streamTurn({
        ...input,
        messages: [
          {
            role: 'assistant',
            content: '',
            toolCalls: [{ id: 'call-0', name: 'search', args: { query: 'cat' } }],
            providerState: end.providerState,
          },
          { role: 'tool', toolCallId: 'call-0', content: 'result' },
        ],
      }),
    );
    expect(mocks.stream.mock.calls[1][0].contents[0].parts[1]).toEqual(part);
  });
  it('validates description JSON', async () => {
    mocks.generate.mockResolvedValue({
      text: JSON.stringify({ summary: 'a', transcript: '', visible_text: '', tags: [] }),
    });
    const result = await new GeminiProvider('key', 1).describe({
      model: 'model',
      pieces: [{ type: 'image', mimeType: 'image/png', data: new Uint8Array([1]) }],
    });
    expect(result[0].summary).toBe('a');
  });
});

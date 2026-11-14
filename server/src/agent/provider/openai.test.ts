import { afterEach, describe, expect, it, vi } from 'vitest';
import { collect } from './contract.js';
import { OpenAICompatibleProvider } from './openai.js';

const provider = () =>
  new OpenAICompatibleProvider({
    provider: 'opencode',
    apiKey: 'private-key',
    baseUrl: 'https://example.com',
    concurrency: 2,
  });
const input = { model: 'model', system: 'system', messages: [], tools: [] };
const sse = (...data: unknown[]) =>
  new Response(data.map((value) => `data: ${JSON.stringify(value)}\n\n`).join('') + 'data: [DONE]\n\n');
afterEach(() => vi.unstubAllGlobals());

describe('OpenAI-compatible adapter', () => {
  it('joins tool arguments and sends reasoning state back unchanged', async () => {
    const details = [{ type: 'reasoning.encrypted', data: 'opaque' }];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        sse(
          {
            choices: [
              {
                delta: {
                  reasoning: 'think',
                  reasoning_details: details,
                  tool_calls: [{ index: 0, id: 'call', function: { name: 'search', arguments: '{' } }],
                },
              },
            ],
          },
          {
            choices: [
              {
                delta: { tool_calls: [{ index: 0, function: { arguments: '"q":1}' } }] },
                finish_reason: 'tool_calls',
              },
            ],
          },
        ),
      )
      .mockResolvedValueOnce(sse({ choices: [{ delta: { content: 'done' }, finish_reason: 'stop' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = provider();
    const events = await collect(adapter.streamTurn(input));
    expect(events).toContainEqual({ type: 'tool_call', id: 'call', name: 'search', args: { q: 1 } });
    expect(events).toContainEqual({ type: 'reasoning.delta', text: 'think' });
    const end = events.at(-1);
    if (end?.type !== 'turn.end') throw new Error('missing end');
    await collect(
      adapter.streamTurn({
        ...input,
        messages: [{ role: 'assistant', content: '', providerState: end.providerState }],
      }),
    );
    const sent = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(sent.messages[1].reasoning_details).toEqual(details);
  });
  it('does not retry OpenCode free-usage errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { type: 'FreeUsageLimitError' } }), { status: 403 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    await expect(collect(provider().streamTurn(input))).rejects.toThrow('OpenCode free-usage limit reached');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(fetchMock.mock.calls[0][1].headers)).not.toContain('x-opencode-session');
  });
});

describe('review fixes', () => {
  it('parses JSON replies wrapped in a markdown fence', async () => {
    const { parseJsonReply } = await import('./prompts.js');
    expect(parseJsonReply('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonReply('{"a":2}')).toEqual({ a: 2 });
  });
  it('maps audio MIME types to input_audio formats', async () => {
    const { audioFormat } = await import('./openai.js');
    expect(audioFormat('audio/mpeg')).toBe('mp3');
    expect(audioFormat('audio/x-m4a')).toBe('m4a');
    expect(audioFormat('audio/wav')).toBe('wav');
  });
  it('reuses one provider instance per configuration so concurrency is process-wide', async () => {
    const { getProvider, getDescribeProvider } = await import('./index.js');
    const env = { LLM_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'k', LLM_CONCURRENCY: '2' };
    expect(getProvider(env)).toBe(getProvider(env));
    expect(getDescribeProvider(env)).toBe(getProvider(env));
  });
});

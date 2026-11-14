import 'dotenv/config';
import { vi } from 'vitest';
import { providerContract } from './contract.js';
import { getProvider } from './index.js';

vi.setConfig({ testTimeout: 120_000 });
const provider = process.env.LIVE_PROVIDER;
if (
  process.env.LIVE === '1' &&
  (provider === 'gemini' || provider === 'openrouter' || provider === 'opencode')
) {
  const model =
    provider === 'gemini'
      ? 'gemini-3.5-flash-lite'
      : provider === 'openrouter'
        ? 'google/gemini-2.5-flash-lite'
        : 'longcat-2.5-free';
  const firstInput = {
    model,
    system: 'Call the search_library tool with query cats before answering.',
    messages: [
      { role: 'user' as const, content: [{ type: 'text' as const, text: 'Search the library for cats.' }] },
    ],
    tools: [
      {
        name: 'search_library',
        description: 'Search the library',
        parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      },
    ],
  };
  providerContract(provider, {
    create: () => getProvider({ ...process.env, LLM_PROVIDER: provider }),
    model,
    piece: {
      type: 'image',
      mimeType: 'image/png',
      data: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a3kAAAAASUVORK5CYII=',
        'base64',
      ),
    },
    reasoning: false,
    firstInput,
    followup: (events) => {
      const call = events.find((event) => event.type === 'tool_call');
      const end = events.at(-1);
      if (!call || call.type !== 'tool_call' || end?.type !== 'turn.end') throw new Error('No tool call');
      return [
        ...firstInput.messages,
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: call.id, name: call.name, args: call.args }],
          providerState: end.providerState,
        },
        { role: 'tool', toolCallId: call.id, content: 'Found a cat.' },
      ];
    },
  });
} else {
  const { it } = await import('vitest');
  it.skip('live provider contract requires LIVE=1 and LIVE_PROVIDER', () => {});
}

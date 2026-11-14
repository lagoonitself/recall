import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SseEventSchema } from '@app/shared';
import { collect, providerContract } from './contract.js';
import { capabilities, FakeProvider, getProvider, getProviderConfig, recordedSseFixture } from './index.js';
import type { FakeScript } from './index.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8')) as FakeScript;
const input = { model: 'test-model', system: 'Test', messages: [], tools: [] };
const piece = { type: 'image' as const, mimeType: 'image/png', data: new Uint8Array([1]) };

providerContract('fake', {
  create: () => new FakeProvider(fixture),
  model: input.model,
  piece,
  reasoning: true,
  firstInput: input,
  followup: (events) => {
    const end = events.at(-1);
    if (end?.type !== 'turn.end') throw new Error('Missing turn end');
    return [
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'call-1', name: 'search_library', args: { query: 'cats' } }],
        providerState: end.providerState,
      },
      { role: 'tool', toolCallId: 'call-1', content: 'A cat' },
    ];
  },
});

describe('fake provider and factory', () => {
  it('replays independent scripts in order and reports exhaustion', async () => {
    const provider = new FakeProvider(fixture);
    expect(await collect(provider.streamTurn(input))).toEqual(fixture.turns?.[0]);
    expect(await collect(provider.streamTurn(input))).toEqual(fixture.turns?.[1]);
    await expect(collect(provider.streamTurn(input))).rejects.toThrow('no scripted turns');
    expect(await collect(new FakeProvider(fixture).streamTurn(input))).toEqual(fixture.turns?.[0]);
  });
  it('rejects invalid and mismatched descriptions', async () => {
    expect(() => new FakeProvider({ descriptions: [{}] as never })).toThrow();
    await expect(new FakeProvider(fixture).describe({ model: 'x', pieces: [piece, piece] })).rejects.toThrow(
      'count',
    );
    expect(await new FakeProvider().describe({ model: 'x', pieces: [piece, piece] })).toHaveLength(2);
  });
  it('returns independent conservative capabilities even for prototype names', () => {
    const first = capabilities('__proto__');
    expect(first).toEqual({
      input: { image: true, pdf: false, audio: false, video: false },
      tools: false,
      reasoning: false,
      maxMediaPartsPerRequest: 1,
    });
    first.input.image = false;
    expect(capabilities('__proto__').input.image).toBe(true);
  });
  it('reads model configuration and rejects unsupported providers', () => {
    const env = { LLM_PROVIDER: 'fake', AGENT_MODEL: 'agent', DESCRIBE_MODEL: 'describe' };
    expect(getProvider(env)).toBeInstanceOf(FakeProvider);
    expect(getProviderConfig(env)).toEqual({
      provider: 'fake',
      agentModel: 'agent',
      describeModel: 'describe',
    });
    expect(() => getProvider({ LLM_PROVIDER: 'secret-value' })).toThrow('Unsupported LLM_PROVIDER');
  });
  it('exports a valid shared SSE fixture', () => {
    for (const event of recordedSseFixture) expect(SseEventSchema.safeParse(event).success).toBe(true);
  });
});

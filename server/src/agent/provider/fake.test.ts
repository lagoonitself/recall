import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SseEventSchema } from '@app/shared';
import { collect, providerContract } from './contract.js';
import {
  capabilities,
  FakeProvider,
  getProvider,
  getDescribeProvider,
  getProviderConfig,
  recordedSseFixture,
} from './index.js';
import { loadConfig } from '../../lib/config.js';
import { GeminiProvider } from './gemini.js';
import { OpenAICompatibleProvider } from './openai.js';
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
  it('validates selected provider credentials independently', () => {
    const base = {
      DATABASE_URL: 'https://example.com',
      JWT_SECRET: 'x'.repeat(32),
      CORS_ORIGIN: 'https://example.com',
      GEMINI_API_KEY: 'key',
    };
    expect(() =>
      loadConfig({ ...base, LLM_PROVIDER: 'fake', DESCRIBE_PROVIDER: 'openrouter', DESCRIBE_MODEL: 'model' }),
    ).toThrow('OPENROUTER_API_KEY');
    expect(() =>
      loadConfig({ ...base, LLM_PROVIDER: 'opencode', AGENT_MODEL: 'model', DESCRIBE_PROVIDER: 'fake' }),
    ).toThrow('OPENCODE_API_KEY');
    expect(
      loadConfig({ ...base, LLM_PROVIDER: 'gemini', AGENT_MODEL: 'model', DESCRIBE_PROVIDER: 'fake' })
        .LLM_PROVIDER,
    ).toBe('gemini');
    expect(() => loadConfig({ ...base, LLM_PROVIDER: 'unknown' })).toThrow('LLM_PROVIDER');
  });
  it('selects the describe provider independently', () => {
    expect(getDescribeProvider()).toBeInstanceOf(FakeProvider);
    expect(
      getDescribeProvider({ LLM_PROVIDER: 'fake', DESCRIBE_PROVIDER: 'gemini', GEMINI_API_KEY: 'key' }),
    ).toBeInstanceOf(GeminiProvider);
    expect(getProvider({ LLM_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'key' })).toBeInstanceOf(
      OpenAICompatibleProvider,
    );
  });
});

import { FakeProvider } from './fake.js';
import { GeminiProvider } from './gemini.js';
import { OpenAICompatibleProvider } from './openai.js';
import type { LlmProvider } from './types.js';
export { capabilities } from './capabilities.js';
export { FakeProvider } from './fake.js';
export type { FakeScript } from './fake.js';
export { recordedSseFixture } from './sse-fixture.js';
export * from './types.js';
export function getProviderConfig(env: NodeJS.ProcessEnv = process.env) {
  return {
    provider: env.LLM_PROVIDER || 'fake',
    agentModel: env.AGENT_MODEL || undefined,
    describeModel: env.DESCRIBE_MODEL || undefined,
  };
}
export function getProvider(env: NodeJS.ProcessEnv = process.env): LlmProvider {
  const { provider } = getProviderConfig(env);
  return selectProvider(provider, env);
}
export function getDescribeProvider(env: NodeJS.ProcessEnv = process.env): LlmProvider {
  return selectProvider(env.DESCRIBE_PROVIDER || env.LLM_PROVIDER || 'fake', env);
}
function selectProvider(provider: string, env: NodeJS.ProcessEnv): LlmProvider {
  if (provider === 'fake') return new FakeProvider();
  if (provider === 'gemini') {
    if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required for the selected provider');
    const concurrency = Number(env.LLM_CONCURRENCY || 2);
    if (!Number.isInteger(concurrency) || concurrency < 1)
      throw new Error('LLM_CONCURRENCY must be a positive integer');
    return new GeminiProvider(env.GEMINI_API_KEY, concurrency);
  }
  if (provider === 'openrouter' || provider === 'opencode') {
    const keyName = provider === 'openrouter' ? 'OPENROUTER_API_KEY' : 'OPENCODE_API_KEY';
    const apiKey = env[keyName];
    if (!apiKey) throw new Error(`${keyName} is required for the selected provider`);
    const baseUrl = provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : env.OPENCODE_BASE_URL;
    if (!baseUrl) throw new Error('OPENCODE_BASE_URL is required for the selected provider');
    const concurrency = Number(env.LLM_CONCURRENCY || 2);
    if (!Number.isInteger(concurrency) || concurrency < 1)
      throw new Error('LLM_CONCURRENCY must be a positive integer');
    return new OpenAICompatibleProvider({ provider, apiKey, baseUrl, concurrency });
  }
  throw new Error('Unsupported LLM_PROVIDER or DESCRIBE_PROVIDER');
}

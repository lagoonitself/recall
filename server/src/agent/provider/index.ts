import { FakeProvider } from './fake.js';
import { PendingProvider } from './pending.js';
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
  return selectProvider(provider);
}
export function getDescribeProvider(env: NodeJS.ProcessEnv = process.env): LlmProvider {
  return selectProvider(env.DESCRIBE_PROVIDER || env.LLM_PROVIDER || 'fake');
}
function selectProvider(provider: string): LlmProvider {
  if (provider === 'fake') return new FakeProvider();
  if (['gemini', 'openrouter', 'opencode'].includes(provider)) return new PendingProvider(provider);
  throw new Error('Unsupported LLM_PROVIDER or DESCRIBE_PROVIDER');
}

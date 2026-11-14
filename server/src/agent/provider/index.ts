import { FakeProvider } from './fake.js';
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
  if (provider === 'fake') return new FakeProvider();
  throw new Error('Unsupported LLM_PROVIDER; only fake is currently available');
}

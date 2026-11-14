import type { ModelCapabilities } from './types.js';
const models: Record<string, ModelCapabilities> = Object.create(null) as Record<string, ModelCapabilities>;
const fallback: ModelCapabilities = {
  input: { image: true, pdf: false, audio: false, video: false },
  tools: false,
  reasoning: false,
  maxMediaPartsPerRequest: 1,
};
export function capabilities(model: string): ModelCapabilities {
  const value = models[model] ?? fallback;
  return { ...value, input: { ...value.input } };
}

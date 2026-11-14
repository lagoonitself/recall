import type { ModelCapabilities } from './types.js';
const models: Record<string, ModelCapabilities> = Object.create(null) as Record<string, ModelCapabilities>;
models['gemini-3.5-flash-lite'] = {
  input: { image: true, pdf: true, audio: true, video: true },
  tools: true,
  reasoning: true,
  maxMediaPartsPerRequest: 1,
};
models['google/gemini-2.5-flash-lite'] = {
  input: { image: true, pdf: true, audio: true, video: true },
  tools: true,
  reasoning: true,
  maxMediaPartsPerRequest: 1,
};
models['nvidia/nemotron-3.5-super-vl:free'] = {
  input: { image: true, pdf: false, audio: false, video: true },
  tools: true,
  reasoning: true,
  maxMediaPartsPerRequest: 1,
};
models['nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free'] = {
  input: { image: true, pdf: false, audio: true, video: true },
  tools: true,
  reasoning: true,
  maxMediaPartsPerRequest: 1,
};
models['longcat-2.5-free'] = {
  input: { image: true, pdf: false, audio: false, video: false },
  tools: true,
  reasoning: true,
  maxMediaPartsPerRequest: 1,
};
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

import { GoogleGenAI } from '@google/genai';

/**
 * Document intelligence models (D30).
 * - `decide`: Gemini Decision 1 (Decisions API). Closed-set yes/no, choice and score questions over text, PDF,
 *   image, audio or video, answered with calibrated probabilities and zero output tokens.
 * - `extract`: a generative Gemini model with a JSON response schema, for field values Decision 1 can't produce.
 */

export type DecisionInputPart =
  | { type: 'text'; text: string }
  | {
      type: 'image' | 'audio' | 'video' | 'document';
      mimeType: string;
      data: Uint8Array;
      resolution?: 'low' | 'medium' | 'high';
    };

export type DecisionQuestion =
  | {
      type: 'noul';
      instructions: string;
      criteria?: { true_description: string; false_description: string };
    }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'score'; instructions: string; criteria: string[] };

export type DecisionAnswer =
  | { type: 'noul'; noul: number; confidence: number }
  | { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: 'score'; score: number; probabilities: Record<string, number>; confidence: number };

export type DecisionAnswers = Record<string, DecisionAnswer>;

export interface DocumentAI {
  decide(input: DecisionInputPart[], questions: Record<string, DecisionQuestion>): Promise<DecisionAnswers>;
  /** Returns parsed JSON that follows `schema`. The caller validates it. */
  extract(input: {
    prompt: string;
    parts: DecisionInputPart[];
    schema: Record<string, unknown>;
  }): Promise<unknown>;
}

const MAX_QUESTIONS = 200;

function toDecisionBlock(part: DecisionInputPart) {
  if (part.type === 'text') return { type: 'text' as const, text: part.text };
  return {
    type: part.type,
    mime_type: part.mimeType,
    data: Buffer.from(part.data).toString('base64'),
    ...(part.resolution && (part.type === 'image' || part.type === 'video')
      ? { resolution: part.resolution }
      : {}),
  };
}

function toGenerativePart(part: DecisionInputPart) {
  if (part.type === 'text') return { text: part.text };
  return { inlineData: { mimeType: part.mimeType, data: Buffer.from(part.data).toString('base64') } };
}

/** Pulls `{ answers }` out of an SDK response and keeps only the fields we use. */
export function normalizeAnswers(raw: unknown): DecisionAnswers {
  const answers = (raw as { answers?: Record<string, Record<string, unknown>> })?.answers ?? {};
  const out: DecisionAnswers = {};
  for (const [key, answer] of Object.entries(answers)) {
    const confidence = Number(answer.confidence ?? 0);
    if (answer.type === 'noul') out[key] = { type: 'noul', noul: Number(answer.noul), confidence };
    else if (answer.type === 'choice')
      out[key] = {
        type: 'choice',
        choice: String(answer.choice),
        probabilities: (answer.probabilities ?? {}) as Record<string, number>,
        confidence,
      };
    else if (answer.type === 'score')
      out[key] = {
        type: 'score',
        score: Number(answer.score),
        probabilities: (answer.probabilities ?? {}) as Record<string, number>,
        confidence,
      };
  }
  return out;
}

export class GeminiDocumentAI implements DocumentAI {
  private readonly ai: GoogleGenAI;
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(
    apiKey: string,
    private readonly decisionModel: string,
    private readonly extractModel: string,
    private readonly concurrency = 2,
  ) {
    this.ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1beta' } });
  }
  private async acquire() {
    if (this.active >= this.concurrency) await new Promise<void>((resolve) => this.queue.push(resolve));
    else this.active++;
  }
  private release() {
    const next = this.queue.shift();
    if (next) next();
    else this.active--;
  }
  private async limited<T>(label: string, operation: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          return await operation();
        } catch (error) {
          const status =
            typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 0;
          const retryable = status === 429 || (status >= 500 && status < 600);
          if (!retryable || attempt >= 3)
            throw new Error(`${label} failed${status ? ` (HTTP ${status})` : ''}`, { cause: error });
          await new Promise((resolve) => setTimeout(resolve, 600 * 2 ** attempt + Math.random() * 300));
        }
      }
    } finally {
      this.release();
    }
  }

  async decide(input: DecisionInputPart[], questions: Record<string, DecisionQuestion>) {
    const entries = Object.entries(questions);
    if (!entries.length) return {};
    if (!input.length) throw new Error('Decision input must not be empty');
    const result: DecisionAnswers = {};
    // The API takes up to 1,000 questions; smaller requests keep each one well inside the context window.
    for (let start = 0; start < entries.length; start += MAX_QUESTIONS) {
      const slice = Object.fromEntries(entries.slice(start, start + MAX_QUESTIONS));
      const response = await this.limited('Gemini Decision request', () =>
        this.ai.decisions.create({
          model: this.decisionModel,
          input: input.map(toDecisionBlock),
          questions: slice,
        } as never),
      );
      Object.assign(result, normalizeAnswers(response));
    }
    return result;
  }

  async extract(input: { prompt: string; parts: DecisionInputPart[]; schema: Record<string, unknown> }) {
    const response = await this.limited('Gemini extraction request', () =>
      this.ai.models.generateContent({
        model: this.extractModel,
        contents: [{ role: 'user', parts: [{ text: input.prompt }, ...input.parts.map(toGenerativePart)] }],
        config: { responseMimeType: 'application/json', responseJsonSchema: input.schema, temperature: 0 },
      }),
    );
    const text = (response.text ?? '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Gemini returned invalid extraction JSON');
    }
  }
}

/** Offline stand-in for tests: answers come from callbacks, or neutral defaults. */
export class FakeDocumentAI implements DocumentAI {
  calls: { input: DecisionInputPart[]; questions: Record<string, DecisionQuestion> }[] = [];
  constructor(
    private readonly script: {
      answer?: (
        key: string,
        question: DecisionQuestion,
        input: DecisionInputPart[],
      ) => DecisionAnswer | undefined;
      extract?: (prompt: string) => unknown;
    } = {},
  ) {}
  async decide(input: DecisionInputPart[], questions: Record<string, DecisionQuestion>) {
    this.calls.push({ input, questions });
    const out: DecisionAnswers = {};
    for (const [key, question] of Object.entries(questions)) {
      const scripted = this.script.answer?.(key, question, input);
      if (scripted) out[key] = scripted;
      else if (question.type === 'noul') out[key] = { type: 'noul', noul: 0.5, confidence: 0.5 };
      else if (question.type === 'choice') {
        const keys = Object.keys(question.criteria).sort();
        const p = 1 / keys.length;
        out[key] = {
          type: 'choice',
          choice: keys[0],
          probabilities: Object.fromEntries(keys.map((k) => [k, p])),
          confidence: p,
        };
      } else {
        const levels = question.criteria.map((_, i) => String(i));
        out[key] = {
          type: 'score',
          score: (levels.length - 1) / 2,
          probabilities: Object.fromEntries(levels.map((l) => [l, 1 / levels.length])),
          confidence: 1 / levels.length,
        };
      }
    }
    return out;
  }
  async extract(input: { prompt: string }) {
    return this.script.extract?.(input.prompt) ?? { summary: '', fields: [] };
  }
}

let cached: DocumentAI | undefined;
/** DOC_AI_PROVIDER=gemini (default) | fake. Gemini Decision 1 needs the Gemini key even when the chat LLM is fake. */
export function getDocumentAI(env: NodeJS.ProcessEnv = process.env): DocumentAI {
  if (cached) return cached;
  const provider = env.DOC_AI_PROVIDER || 'gemini';
  if (provider === 'fake') return (cached = new FakeDocumentAI());
  if (provider !== 'gemini') throw new Error('Unsupported DOC_AI_PROVIDER');
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required for document intelligence');
  return (cached = new GeminiDocumentAI(
    env.GEMINI_API_KEY,
    env.DECISION_MODEL || 'gemini-decision-1',
    env.EXTRACT_MODEL || 'gemini-3.5-flash-lite',
    Number(env.DOC_AI_CONCURRENCY || 2),
  ));
}

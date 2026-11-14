import { GoogleGenAI } from '@google/genai';
import type { Content, Part } from '@google/genai';
import { capabilities } from './capabilities.js';
import { DESCRIBE_PROMPT, parseJsonReply } from './prompts.js';
import { PieceDescriptionSchema } from './types.js';
import type { AgentMessage, LlmProvider, MediaPart, ProviderEvent, TextPart } from './types.js';

function mediaParts(parts: (TextPart | MediaPart)[]): Part[] {
  return parts.map((part) =>
    part.type === 'text'
      ? { text: part.text }
      : { inlineData: { mimeType: part.mimeType, data: Buffer.from(part.data).toString('base64') } },
  );
}
export function contents(messages: AgentMessage[]): Content[] {
  const toolNames = new Map<string, string>();
  const list: Content[] = messages.map((message) => {
    if (message.role === 'user') return { role: 'user', parts: mediaParts(message.content) };
    if (message.role === 'tool') {
      const name = toolNames.get(message.toolCallId);
      if (!name) throw new Error('Unknown Gemini tool call');
      return {
        role: 'user',
        parts: [
          { functionResponse: { name, id: message.toolCallId, response: { result: message.content } } },
        ],
      };
    }
    for (const call of message.toolCalls ?? []) toolNames.set(call.id, call.name);
    const state = message.providerState as { parts?: Part[] } | undefined;
    const parts = state?.parts ?? [
      ...(message.content ? [{ text: message.content }] : []),
      ...(message.toolCalls ?? []).map((call) => ({
        functionCall: { id: call.id, name: call.name, args: call.args as Record<string, unknown> },
      })),
    ];
    return { role: 'model', parts };
  });
  // Gemini wants user/model turns to alternate: parallel tool results and the media that follows them
  // (open_sources) become one user turn.
  const merged: Content[] = [];
  for (const content of list) {
    const last = merged.at(-1);
    if (last && last.role === content.role) last.parts = [...(last.parts ?? []), ...(content.parts ?? [])];
    else merged.push({ ...content, parts: [...(content.parts ?? [])] });
  }
  return merged;
}

export class GeminiProvider implements LlmProvider {
  private readonly ai: GoogleGenAI;
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(
    apiKey: string,
    private readonly concurrency: number,
  ) {
    this.ai = new GoogleGenAI({ apiKey });
  }
  capabilities = capabilities;
  private async acquire() {
    if (this.active >= this.concurrency) await new Promise<void>((resolve) => this.queue.push(resolve));
    else this.active++;
  }
  private release() {
    const next = this.queue.shift();
    if (next) next();
    else this.active--;
  }
  private async retry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await operation();
      } catch (error) {
        const status =
          typeof error === 'object' && error !== null && 'status' in error ? Number(error.status) : 0;
        if ((status !== 429 && (status < 500 || status >= 600)) || attempt === 4)
          throw new Error(`Gemini request failed${status ? ` (HTTP ${status})` : ''}`);
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt + Math.random() * 250));
      }
    }
    throw new Error('Gemini request failed');
  }
  async *streamTurn(input: Parameters<LlmProvider['streamTurn']>[0]): AsyncIterable<ProviderEvent> {
    await this.acquire();
    try {
      const stream = await this.retry(() =>
        this.ai.models.generateContentStream({
          model: input.model,
          contents: contents(input.messages),
          config: {
            systemInstruction: input.system,
            thinkingConfig: { includeThoughts: true },
            ...(input.tools.length
              ? {
                  tools: [
                    {
                      functionDeclarations: input.tools.map((tool) => ({
                        name: tool.name,
                        description: tool.description,
                        parametersJsonSchema: tool.parameters,
                      })),
                    },
                  ],
                }
              : {}),
          },
        }),
      );
      const state: Part[] = [];
      let callCount = 0;
      let finish = '';
      try {
        for await (const chunk of stream) {
          const candidate = chunk.candidates?.[0];
          if (candidate?.finishReason) finish = candidate.finishReason;
          for (const part of candidate?.content?.parts ?? []) {
            state.push(part);
            if (part.text) yield { type: part.thought ? 'reasoning.delta' : 'text.delta', text: part.text };
            if (part.functionCall?.name) {
              const call = part.functionCall;
              const id = call.id ?? `call-${callCount}`;
              callCount++;
              yield { type: 'tool_call', id, name: call.name!, args: call.args ?? {} };
            }
          }
        }
      } catch {
        throw new Error('Gemini stream failed');
      }
      yield {
        type: 'turn.end',
        stopReason: callCount ? 'tool_calls' : finish === 'MAX_TOKENS' ? 'length' : 'stop',
        providerState: { parts: state },
      };
    } finally {
      this.release();
    }
  }
  async describe(input: Parameters<LlmProvider['describe']>[0]) {
    return Promise.all(
      input.pieces.map(async (piece) => {
        await this.acquire();
        try {
          const result = await this.retry(() =>
            this.ai.models.generateContent({
              model: input.model,
              contents: [
                {
                  role: 'user',
                  parts: mediaParts([
                    {
                      type: 'text',
                      text: DESCRIBE_PROMPT,
                    },
                    piece,
                  ]),
                },
              ],
              config: { responseMimeType: 'application/json' },
            }),
          );
          try {
            return PieceDescriptionSchema.parse(parseJsonReply(result.text ?? ''));
          } catch {
            throw new Error('Gemini returned an invalid description');
          }
        } finally {
          this.release();
        }
      }),
    );
  }
}

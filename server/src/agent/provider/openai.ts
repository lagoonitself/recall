import { capabilities } from './capabilities.js';
import { DESCRIBE_PROMPT, parseJsonReply } from './prompts.js';
import { PieceDescriptionSchema } from './types.js';
import type { AgentMessage, LlmProvider, MediaPart, ProviderEvent, TextPart } from './types.js';

type Options = {
  apiKey: string;
  baseUrl: string;
  provider: 'openrouter' | 'opencode';
  concurrency: number;
  appUrl?: string;
};
type Delta = {
  content?: string | null;
  reasoning?: string | null;
  reasoning_details?: unknown[];
  tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[];
};
type Chunk = { choices?: { delta?: Delta; finish_reason?: string | null }[]; error?: unknown };

// OpenAI-style input_audio wants a short format name, not the MIME subtype ("audio/mpeg" -> "mp3").
const AUDIO_FORMATS: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
};
export const audioFormat = (mime: string) => AUDIO_FORMATS[mime] ?? mime.split('/')[1] ?? 'mp3';

function parts(content: (TextPart | MediaPart)[]) {
  return content.map((part) => {
    if (part.type === 'text') return { type: 'text', text: part.text };
    const data = Buffer.from(part.data).toString('base64');
    const url = `data:${part.mimeType};base64,${data}`;
    if (part.type === 'image') return { type: 'image_url', image_url: { url } };
    if (part.type === 'pdf') return { type: 'file', file: { filename: 'document.pdf', file_data: url } };
    if (part.type === 'audio')
      return { type: 'input_audio', input_audio: { data, format: audioFormat(part.mimeType) } };
    return { type: 'video_url', video_url: { url } };
  });
}

function messages(input: AgentMessage[]) {
  return input.map((message) => {
    if (message.role === 'user') return { role: 'user', content: parts(message.content) };
    if (message.role === 'tool')
      return {
        role: 'tool',
        tool_call_id: message.toolCallId,
        content: typeof message.content === 'string' ? message.content : parts(message.content),
      };
    return {
      role: 'assistant',
      content: message.content || null,
      ...(message.toolCalls?.length
        ? {
            tool_calls: message.toolCalls.map((call) => ({
              id: call.id,
              type: 'function',
              function: { name: call.name, arguments: JSON.stringify(call.args) },
            })),
          }
        : {}),
      ...(message.providerState && typeof message.providerState === 'object' ? message.providerState : {}),
    };
  });
}

export class OpenAICompatibleProvider implements LlmProvider {
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(private readonly options: Options) {}
  capabilities = capabilities;
  private async acquire() {
    if (this.active >= this.options.concurrency)
      await new Promise<void>((resolve) => this.queue.push(resolve));
    else this.active++;
  }
  private release() {
    const next = this.queue.shift();
    if (next) next();
    else this.active--;
  }
  private async request(body: unknown) {
    for (let attempt = 0; attempt < 5; attempt++) {
      let response: Response;
      try {
        response = await fetch(`${this.options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.options.apiKey}`,
            'Content-Type': 'application/json',
            ...(this.options.provider === 'openrouter'
              ? {
                  ...(this.options.appUrl ? { 'HTTP-Referer': this.options.appUrl } : {}),
                  'X-Title': 'Recall',
                }
              : {}),
          },
          body: JSON.stringify(body),
        });
      } catch {
        throw new Error(`${this.options.provider} request failed`);
      }
      if (response.ok) return response;
      const errorBody = (await response.json().catch(() => null)) as { error?: { type?: string } } | null;
      if (this.options.provider === 'opencode' && errorBody?.error?.type === 'FreeUsageLimitError') {
        throw new Error(
          'OpenCode free-usage limit reached; free models need OpenCode Go when called from another app',
        );
      }
      if ((response.status !== 429 && response.status < 500) || response.status >= 600 || attempt === 4) {
        throw new Error(`${this.options.provider} request failed (HTTP ${response.status})`);
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt + Math.random() * 250));
    }
    throw new Error(`${this.options.provider} request failed`);
  }
  async *streamTurn(input: Parameters<LlmProvider['streamTurn']>[0]): AsyncIterable<ProviderEvent> {
    await this.acquire();
    try {
      const response = await this.request({
        model: input.model,
        stream: true,
        messages: [{ role: 'system', content: input.system }, ...messages(input.messages)],
        ...(input.tools.length
          ? { tools: input.tools.map((tool) => ({ type: 'function', function: tool })) }
          : {}),
      });
      if (!response.body) throw new Error('Provider returned an empty stream');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finish = 'stop';
      const calls = new Map<number, { id: string; name: string; args: string }>();
      const reasoningDetails: unknown[] = [];
      try {
        while (true) {
          const next = await reader.read();
          buffer += decoder.decode(next.value, { stream: !next.done });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (!data || data === '[DONE]') continue;
            let chunk: Chunk;
            try {
              chunk = JSON.parse(data) as Chunk;
            } catch {
              throw new Error('Provider returned invalid stream data');
            }
            if (chunk.error) throw new Error('Provider stream failed');
            const choice = chunk.choices?.[0];
            const delta = choice?.delta;
            if (choice?.finish_reason) finish = choice.finish_reason;
            if (delta?.content) yield { type: 'text.delta', text: delta.content };
            if (delta?.reasoning) yield { type: 'reasoning.delta', text: delta.reasoning };
            if (delta?.reasoning_details) {
              reasoningDetails.push(...delta.reasoning_details);
              for (const detail of delta.reasoning_details) {
                if (
                  !delta.reasoning &&
                  typeof detail === 'object' &&
                  detail !== null &&
                  'text' in detail &&
                  typeof detail.text === 'string'
                )
                  yield { type: 'reasoning.delta', text: detail.text };
              }
            }
            for (const part of delta?.tool_calls ?? []) {
              const call = calls.get(part.index) ?? { id: '', name: '', args: '' };
              call.id += part.id ?? '';
              call.name += part.function?.name ?? '';
              call.args += part.function?.arguments ?? '';
              calls.set(part.index, call);
            }
          }
          if (next.done) break;
        }
      } finally {
        await reader.cancel().catch(() => undefined);
      }
      for (const call of calls.values()) {
        let args: unknown;
        try {
          args = JSON.parse(call.args);
        } catch {
          throw new Error('Provider returned invalid tool arguments');
        }
        if (!call.id || !call.name) throw new Error('Provider returned incomplete tool call');
        yield { type: 'tool_call', id: call.id, name: call.name, args };
      }
      yield {
        type: 'turn.end',
        stopReason: calls.size ? 'tool_calls' : finish === 'length' ? 'length' : 'stop',
        ...(reasoningDetails.length ? { providerState: { reasoning_details: reasoningDetails } } : {}),
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
          const response = await this.request({
            model: input.model,
            stream: false,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'user',
                content: parts([
                  {
                    type: 'text',
                    text: DESCRIBE_PROMPT,
                  },
                  piece,
                ]),
              },
            ],
          });
          const result = (await response.json()) as { choices?: { message?: { content?: string } }[] };
          const content = result.choices?.[0]?.message?.content;
          if (!content) throw new Error('Provider returned an empty description');
          try {
            return PieceDescriptionSchema.parse(parseJsonReply(content));
          } catch {
            throw new Error('Provider returned an invalid description');
          }
        } finally {
          this.release();
        }
      }),
    );
  }
}

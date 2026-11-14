import { GoogleGenAI } from '@google/genai';
import type { Readable } from 'node:stream';
import { loadConfig } from './config.js';
import { throttle } from './throttle.js';

const MAX_INLINE_BYTES = 15 * 1024 * 1024;
type Task = 'document' | 'query';
type Media = { mimeType: string } & (
  { data: Uint8Array; stream?: never } | { stream: Readable; data?: never }
);
type Options = { apiKey: string; model: string; rpm: number; concurrency: number };

export class EmbedError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'EmbedError';
  }
}

async function mediaBytes(media: Media): Promise<Buffer> {
  if (media.data) {
    if (media.data.byteLength > MAX_INLINE_BYTES) throw new EmbedError('Media exceeds the inline size limit');
    return Buffer.from(media.data);
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const part of media.stream) {
    const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
    size += chunk.length;
    if (size > MAX_INLINE_BYTES) throw new EmbedError('Media exceeds the inline size limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function createEmbedClient(options: Options) {
  if (options.model !== 'gemini-embedding-2') throw new EmbedError('Only gemini-embedding-2 is permitted');
  const ai = new GoogleGenAI({ apiKey: options.apiKey });
  const schedule = throttle(options.concurrency, options.rpm);

  async function embed(contents: string | { inlineData: { mimeType: string; data: string } }) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const response = await schedule(() =>
          ai.models.embedContent({
            model: options.model,
            contents,
            config: { outputDimensionality: 1536 },
          }),
        );
        const values = response.embeddings?.[0]?.values;
        if (!values || values.length !== 1536 || values.some((value) => !Number.isFinite(value))) {
          throw new EmbedError('Embedding response must contain 1536 finite values');
        }
        return values;
      } catch (error) {
        if (error instanceof EmbedError) throw error;
        const status =
          typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
            ? error.status
            : undefined;
        if ((status !== 429 && !(status && status >= 500 && status < 600)) || attempt === 4) {
          throw new EmbedError('Embedding request failed', status, { cause: error });
        }
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt + Math.random() * 250));
      }
    }
    throw new EmbedError('Embedding request failed');
  }

  return {
    embedText: (text: string, task: Task = 'document') =>
      embed(task === 'query' ? `task: search result | query: ${text}` : `title: none | text: ${text}`),
    embedMedia: async (media: Media) => {
      try {
        const bytes = await mediaBytes(media);
        return await embed({ inlineData: { mimeType: media.mimeType, data: bytes.toString('base64') } });
      } catch (error) {
        if (error instanceof EmbedError) throw error;
        throw new EmbedError('Could not read embedding media', undefined, { cause: error });
      }
    },
  };
}

let defaultClient: ReturnType<typeof createEmbedClient> | undefined;
function client() {
  if (!defaultClient) {
    const config = loadConfig();
    defaultClient = createEmbedClient({
      apiKey: config.GEMINI_API_KEY,
      model: config.EMBED_MODEL,
      rpm: config.EMBED_RPM,
      concurrency: config.EMBED_CONCURRENCY,
    });
  }
  return defaultClient;
}
export const embedText = (text: string, task: Task = 'document') => client().embedText(text, task);
export const embedMedia = (media: Media) => client().embedMedia(media);

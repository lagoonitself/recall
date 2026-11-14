import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { createEmbedClient, EmbedError } from '../src/lib/embed.js';
import { throttle } from '../src/lib/throttle.js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { embedContent: request };
  },
}));
const vector = Array.from({ length: 1536 }, () => 0.1);
const options = { apiKey: 'test', model: 'gemini-embedding-2', rpm: 6000000, concurrency: 2 };

beforeEach(() => {
  request.mockReset();
});

describe('embedding client', () => {
  it('retries a 429 then returns the vector with query task type', async () => {
    request
      .mockRejectedValueOnce({ status: 429 })
      .mockResolvedValueOnce({ embeddings: [{ values: vector }] });
    const result = await createEmbedClient(options).embedText('query', 'query');
    expect(result).toEqual(vector);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contents: 'task: search result | query: query',
        config: { outputDimensionality: 1536 },
      }),
    );
  });
  it('does not retry a 400 and preserves its status', async () => {
    request.mockRejectedValue({ status: 400 });
    await expect(createEmbedClient(options).embedText('bad')).rejects.toMatchObject({
      name: 'EmbedError',
      status: 400,
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('encodes a stream as one media input', async () => {
    request.mockResolvedValue({ embeddings: [{ values: vector }] });
    await createEmbedClient(options).embedMedia({
      mimeType: 'image/png',
      stream: Readable.from([Buffer.from('demo')]),
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ contents: { inlineData: { mimeType: 'image/png', data: 'ZGVtbw==' } } }),
    );
  });
  it('rejects invalid dimensions and other models', async () => {
    request.mockResolvedValue({ embeddings: [{ values: [1] }] });
    await expect(createEmbedClient(options).embedText('text')).rejects.toBeInstanceOf(EmbedError);
    expect(() => createEmbedClient({ ...options, model: 'other' })).toThrow(EmbedError);
  });
  it('rejects oversized media without calling the API', async () => {
    await expect(
      createEmbedClient(options).embedMedia({
        mimeType: 'image/png',
        data: Buffer.alloc(15 * 1024 * 1024 + 1),
      }),
    ).rejects.toThrow(EmbedError);
    expect(request).not.toHaveBeenCalled();
  });
});

describe('throttle', () => {
  it('limits simultaneous operations', async () => {
    const schedule = throttle(1, 6000000);
    let release!: () => void;
    const first = schedule(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const secondOperation = vi.fn(async () => 2);
    const second = schedule(secondOperation);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(secondOperation).not.toHaveBeenCalled();
    release();
    await first;
    expect(await second).toBe(2);
  });
});

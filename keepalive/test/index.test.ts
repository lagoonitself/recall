import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import worker, { pingHealth, type ScheduledEvent, type ExecutionContext } from '../src/index.js';

describe('keepalive worker', () => {
  const originalFetch = globalThis.fetch;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const mockCtx: ExecutionContext = {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  };

  const mockEvent: ScheduledEvent = {
    cron: '*/10 * * * *',
    scheduledTime: 1700000000000,
  };

  it('calls /api/health with GET and logs the status when response is ok', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204, statusText: 'No Content' }));
    globalThis.fetch = mockFetch;

    await worker.scheduled(mockEvent, { TARGET_URL: 'https://recall-server.onrender.com' }, mockCtx);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith('https://recall-server.onrender.com/api/health', {
      method: 'GET',
      headers: {
        'User-Agent': 'recall-keepalive-worker/1.0',
      },
    });

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '[keepalive] GET https://recall-server.onrender.com/api/health -> 204 No Content',
      ),
    );
  });

  it('handles fetch failure gracefully without throwing and logs error', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Connection timed out'));
    globalThis.fetch = mockFetch;

    await expect(
      worker.scheduled(mockEvent, { TARGET_URL: 'https://recall-server.onrender.com' }, mockCtx),
    ).resolves.not.toThrow();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '[keepalive] GET https://recall-server.onrender.com/api/health failed: Connection timed out',
      ),
    );
  });

  it('warns when TARGET_URL is not configured', async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    await worker.scheduled(mockEvent, {}, mockCtx);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('[keepalive] TARGET_URL is not configured');
  });

  it('normalizes trailing slash in TARGET_URL', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204, statusText: 'No Content' }));
    globalThis.fetch = mockFetch;

    await pingHealth('https://recall-server.onrender.com///');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://recall-server.onrender.com/api/health',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('handles fetch() request as manual ping', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204, statusText: 'No Content' }));
    globalThis.fetch = mockFetch;

    const res = await worker.fetch(
      new Request('http://localhost'),
      { TARGET_URL: 'https://recall-server.onrender.com' },
      mockCtx,
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });
});

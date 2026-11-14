export interface Env {
  TARGET_URL?: string;
}

export interface ScheduledEvent {
  readonly scheduledTime: number;
  readonly cron: string;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export interface PingResult {
  ok: boolean;
  status?: number;
  error?: string;
}

export async function pingHealth(targetUrl?: string): Promise<PingResult> {
  if (!targetUrl) {
    console.warn('[keepalive] TARGET_URL is not configured');
    return { ok: false, error: 'TARGET_URL not configured' };
  }

  const normalizedBase = targetUrl.replace(/\/+$/, '');
  const healthUrl = `${normalizedBase}/api/health`;

  try {
    const res = await fetch(healthUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'recall-keepalive-worker/1.0',
      },
    });
    console.log(`[keepalive] GET ${healthUrl} -> ${res.status} ${res.statusText}`);
    return { ok: res.ok, status: res.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Log gracefully and do not throw: Render cold starts or transient network blips can happen
    console.error(`[keepalive] GET ${healthUrl} failed: ${message}`);
    return { ok: false, error: message };
  }
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`[keepalive] Cron ${event.cron} triggered at ${new Date(event.scheduledTime).toISOString()}`);
    void ctx; // the returned promise keeps the invocation alive until the ping finishes
    await pingHealth(env.TARGET_URL);
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    void request;
    void ctx;
    const result = await pingHealth(env.TARGET_URL);
    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 502,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};

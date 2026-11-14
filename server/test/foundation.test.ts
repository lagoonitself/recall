import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { createApp } from '../src/index.js';
import { loadConfig } from '../src/lib/config.js';
import { errorHandler, HttpError } from '../src/lib/errors.js';
import { validate } from '../src/lib/validation.js';

const baseEnv = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(64),
  CORS_ORIGIN: 'http://localhost:5173',
  GEMINI_API_KEY: 'test-key',
};

describe('config', () => {
  it('applies §15 defaults with the fake provider and no R2 keys', () => {
    const c = loadConfig(baseEnv);
    expect(c).toMatchObject({ PORT: 3000, EMBED_DIM: 1536, LLM_PROVIDER: 'fake', AUDIO_PIECE_SEC: 150 });
  });
  it('requires LLM settings for a real provider', () => {
    expect(() => loadConfig({ ...baseEnv, LLM_PROVIDER: 'openrouter' })).toThrow(/AGENT_MODEL/);
  });
  it('fails fast and names the missing variable', () => {
    expect(() => loadConfig({ ...baseEnv, DATABASE_URL: '' })).toThrow(/DATABASE_URL/);
  });
});

describe('errors', () => {
  it('returns 404 in the error shape for unknown API routes', async () => {
    const res = await request(createApp()).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
  it('returns 400, not 500, for malformed JSON', async () => {
    const res = await request(createApp())
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });
  it('sends HttpError status, code and details', async () => {
    const app = express();
    app.get('/', () => {
      throw new HttpError(409, 'CONFLICT', 'Name taken', { field: 'name' });
    });
    app.use(errorHandler);
    const res = await request(app).get('/');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: { code: 'CONFLICT', message: 'Name taken', details: { field: 'name' } },
    });
  });
});

describe('validate', () => {
  it('validates params and query into res.locals', async () => {
    const app = express();
    app.get(
      '/items/:id',
      validate({ params: z.object({ id: z.uuid() }), query: z.object({ q: z.string() }) }),
      (_req, res) => {
        res.json(res.locals);
      },
    );
    app.use(errorHandler);
    const id = '00000000-0000-4000-8000-000000000001';
    const ok = await request(app).get(`/items/${id}?q=hi`);
    expect(ok.body).toMatchObject({ params: { id }, query: { q: 'hi' } });
    const bad = await request(app).get('/items/not-a-uuid?q=hi');
    expect(bad.status).toBe(400);
  });
});

import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { createApp } from '../src/index.js';
import { errorHandler } from '../src/lib/errors.js';
import { validateBody } from '../src/lib/validation.js';
describe('HTTP foundation', () => {
 it('returns 204 from health without configuration', async () => { const res = await request(createApp()).get('/api/health'); expect(res.status).toBe(204); expect(res.text).toBe(''); });
 it('returns the validation error shape', async () => { const app = express(); app.use(express.json()); app.post('/', validateBody(z.object({ name: z.string() })), (_req, res) => res.sendStatus(204)); app.use(errorHandler); const res = await request(app).post('/').send({ name: 42 }); expect(res.status).toBe(400); expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', message: 'Invalid request' }); expect(res.body.error.details).toBeDefined(); });
 it('does not expose internal errors', async () => { const app = express(); app.get('/', () => { throw new Error('secret'); }); app.use(errorHandler); const res = await request(app).get('/'); expect(res.status).toBe(500); expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }); });
});

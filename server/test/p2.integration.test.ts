import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createPool } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';
import { signToken } from '../src/lib/auth.js';
import { createR2 } from '../src/lib/r2.js';
import { createApp } from '../src/index.js';

const testUrl = process.env.TEST_DATABASE_URL;
const ready = Boolean(
  testUrl && process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY,
);
describe.skipIf(!ready)('P2 integration on test database and R2', () => {
  if (testUrl === process.env.DATABASE_URL)
    throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL');
  const pool = createPool(testUrl!);
  const storage = createR2();
  const secret = 'test-secret-'.repeat(4);
  const app = createApp({
    pool,
    jwtSecret: secret,
    storage,
    fileLimits: { maxFileMb: 1, userQuotaMb: 1, uploadsPerDay: 3 },
  });
  const ids: string[] = [];
  let owner = '';
  let other = '';
  let collection = '';
  let auth = '';
  let otherAuth = '';
  beforeAll(async () => {
    await migrate(pool);
    for (let index = 0; index < 2; index++) {
      const result = await pool.query('INSERT INTO users(email) VALUES ($1) RETURNING id', [
        `p2-${randomUUID()}@example.com`,
      ]);
      ids.push(result.rows[0].id);
    }
    [owner, other] = ids;
    auth = `Bearer ${signToken(owner, secret)}`;
    otherAuth = `Bearer ${signToken(other, secret)}`;
    const result = await pool.query('INSERT INTO collections(user_id,name) VALUES ($1,$2) RETURNING id', [
      owner,
      'P2',
    ]);
    collection = result.rows[0].id;
  }, 30000);
  afterAll(async () => {
    try {
      for (const id of ids) await storage.deletePrefix(`users/${id}/files/`);
      if (ids.length) await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
    } finally {
      await pool.end();
    }
  }, 30000);
  it('uploads, verifies, queues, isolates and deletes the original and derivatives', async () => {
    const data = Buffer.from('P2 round trip');
    const body = {
      name: 'sample.txt',
      mimeType: 'text/plain',
      sizeBytes: data.length,
      collectionId: collection,
    };
    expect(
      (await request(app).post('/api/files/upload-url').set('Authorization', otherAuth).send(body)).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .post('/api/files/upload-url')
          .set('Authorization', auth)
          .send({ ...body, mimeType: 'image/heic' })
      ).status,
    ).toBe(400);
    const created = await request(app).post('/api/files/upload-url').set('Authorization', auth).send(body);
    expect(created.status).toBe(201);
    const { fileId, url } = created.body;
    const signed = new URL(url);
    expect(signed.searchParams.get('X-Amz-SignedHeaders')).toContain('content-length');
    expect(signed.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
    const put = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': body.mimeType, 'Content-Length': String(data.length) },
      body: data,
    });
    expect(put.status).toBe(200);
    expect(
      (await request(app).post(`/api/files/${fileId}/complete`).set('Authorization', otherAuth)).status,
    ).toBe(404);
    expect((await request(app).get(`/api/files/${fileId}`).set('Authorization', otherAuth)).status).toBe(404);
    expect((await request(app).delete(`/api/files/${fileId}`).set('Authorization', otherAuth)).status).toBe(
      404,
    );
    expect(
      (await request(app).post(`/api/files/${fileId}/complete`).set('Authorization', auth)).body.file.status,
    ).toBe('queued');
    expect(
      (await pool.query('SELECT count(*)::int AS count FROM jobs WHERE file_id=$1', [fileId])).rows[0].count,
    ).toBe(1);
    expect((await request(app).post(`/api/files/${fileId}/complete`).set('Authorization', auth)).status).toBe(
      409,
    );
    expect((await request(app).get('/api/files').set('Authorization', auth)).body.files).toHaveLength(1);
    const prefix = `users/${owner}/files/${fileId}/`;
    await storage.put(prefix + 'pieces/0.txt', data, 'text/plain');
    await storage.put(prefix + 'thumbs/0.jpg', data, 'image/jpeg');
    const chunk = await pool.query(
      `INSERT INTO chunks(file_id,user_id,collection_id,modality,seq,r2_key,thumb_r2_key,embedding)
       VALUES ($1,$2,$3,'text',0,$4,$5,$6::halfvec) RETURNING id`,
      [
        fileId,
        owner,
        collection,
        prefix + 'pieces/0.txt',
        prefix + 'thumbs/0.jpg',
        `[${Array(1536).fill(0.1).join(',')}]`,
      ],
    );
    const chunkId = chunk.rows[0].id;
    expect(
      (await request(app).get(`/api/chunks/${chunkId}/media`).set('Authorization', otherAuth)).status,
    ).toBe(404);
    const media = await request(app)
      .get(`/api/chunks/${chunkId}/media?thumbnail=true`)
      .set('Authorization', auth);
    expect(media.status).toBe(200);
    expect((await fetch(media.body.url)).status).toBe(200);
    expect((await request(app).delete(`/api/files/${fileId}`).set('Authorization', auth)).status).toBe(204);
    await expect(storage.head(prefix + 'pieces/0.txt')).rejects.toBeDefined();
    await expect(storage.head(prefix + 'thumbs/0.jpg')).rejects.toBeDefined();
    await expect(storage.head(prefix + 'original.txt')).rejects.toBeDefined();
  }, 60000);
  it('marks a mismatched object failed and enforces the daily limit after deletion', async () => {
    const body = { name: 'missing.txt', mimeType: 'text/plain', sizeBytes: 3, collectionId: collection };
    const created = await request(app).post('/api/files/upload-url').set('Authorization', auth).send(body);
    expect(created.status).toBe(201);
    await storage.put(
      `users/${owner}/files/${created.body.fileId}/original.txt`,
      Buffer.from('wrong size'),
      'text/plain',
    );
    expect(
      (await request(app).post(`/api/files/${created.body.fileId}/complete`).set('Authorization', auth))
        .status,
    ).toBe(400);
    expect(
      (await request(app).get(`/api/files/${created.body.fileId}`).set('Authorization', auth)).body.file
        .status,
    ).toBe('failed');
    expect(
      (await request(app).delete(`/api/files/${created.body.fileId}`).set('Authorization', auth)).status,
    ).toBe(204);
    expect(
      (await request(app).post('/api/files/upload-url').set('Authorization', auth).send(body)).status,
    ).toBe(201);
    expect(
      (await request(app).post('/api/files/upload-url').set('Authorization', auth).send(body)).status,
    ).toBe(429);
  }, 60000);
});

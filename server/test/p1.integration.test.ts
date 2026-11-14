import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createPool } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';
import { createApp } from '../src/index.js';
import { signToken } from '../src/lib/auth.js';

const testUrl = process.env.TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;
suite('P1 integration on TEST_DATABASE_URL', () => {
  if (testUrl && testUrl === process.env.DATABASE_URL)
    throw new Error('TEST_DATABASE_URL must be distinct from DATABASE_URL');
  const pool = createPool(testUrl ?? 'postgres://localhost/unused');
  const secret = 'test-secret-'.repeat(4);
  const suffix = randomUUID();
  const email = 'p1-' + suffix + '@example.com';
  const secondEmail = 'p1-second-' + suffix + '@example.com';
  const googleEmail = 'p1-google-' + suffix + '@example.com';
  const googleSub = 'google-' + suffix;
  let token = '';
  let secondToken = '';
  let userId = '';
  let collectionId = '';
  const app = createApp({
    pool,
    jwtSecret: secret,
    googleClientId: 'test-client',
    googleVerifier: async (credential, audience) => {
      expect(audience).toBe('test-client');
      if (credential === 'invalid') throw new Error('invalid');
      return {
        sub: googleSub,
        email: credential === 'link' ? email.toUpperCase() : googleEmail,
        email_verified: credential !== 'unverified',
        iss: 'accounts.google.com',
        aud: audience,
        iat: 1,
        exp: 2,
        picture: 'https://example.com/avatar.png',
      };
    },
  });
  let migrated = false;
  beforeAll(async () => {
    await migrate(pool);
    migrated = true;
  }, 30000);
  afterAll(async () => {
    if (migrated)
      await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [
        [email, secondEmail, googleEmail],
      ]);
    await pool.end();
  });
  it('applies migrations only once and has a compatible vector extension', async () => {
    const before = await pool.query('SELECT name, applied_at FROM schema_migrations ORDER BY name');
    await migrate(pool);
    expect((await pool.query('SELECT name, applied_at FROM schema_migrations ORDER BY name')).rows).toEqual(
      before.rows,
    );
    const version = (await pool.query("SELECT extversion FROM pg_extension WHERE extname = 'vector'")).rows[0]
      .extversion as string;
    expect(Number(version.split('.')[0]) > 0 || Number(version.split('.')[1]) >= 7).toBe(true);
  }, 30000);
  it('seeds users, reads me, and has no password routes', async () => {
    // Sign-in is Google only (D22): test users are inserted directly and get tokens from signToken.
    const first = await pool.query(
      "INSERT INTO users(email, password_hash) VALUES ($1, 'legacy-hash') RETURNING id",
      [email],
    );
    userId = first.rows[0].id;
    token = signToken(userId, secret);
    const second = await pool.query('INSERT INTO users(email) VALUES ($1) RETURNING id', [secondEmail]);
    secondToken = signToken(second.rows[0].id, secret);
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer ' + token);
    expect(me.body.user).toMatchObject({ id: userId, email, avatarUrl: null });
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    for (const path of ['/api/auth/register', '/api/auth/login'])
      expect((await request(app).post(path).send({ email, password: 'password123' })).status).toBe(404);
  }, 30000);
  it('creates, lists, updates, deletes and isolates collections', async () => {
    const auth = 'Bearer ' + token;
    const other = 'Bearer ' + secondToken;
    const created = await request(app)
      .post('/api/collections')
      .set('Authorization', auth)
      .send({ name: 'First' });
    expect(created.status).toBe(201);
    collectionId = created.body.collection.id;
    const list = await request(app).get('/api/collections').set('Authorization', auth);
    expect(list.body.collections).toEqual([expect.objectContaining({ id: collectionId, fileCount: 0 })]);
    expect(
      (
        await request(app)
          .patch('/api/collections/' + collectionId)
          .set('Authorization', other)
          .send({ name: 'Stolen' })
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .delete('/api/collections/' + collectionId)
          .set('Authorization', other)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .patch('/api/collections/' + collectionId)
          .set('Authorization', auth)
          .send({ name: 'Updated', description: 'Description' })
      ).body.collection.name,
    ).toBe('Updated');
    expect(
      (
        await request(app)
          .delete('/api/collections/' + collectionId)
          .set('Authorization', auth)
      ).status,
    ).toBe(204);
  });
  it('verifies Google, links email, and rejects invalid identities', async () => {
    expect((await request(app).get('/api/auth/config')).body).toEqual({ googleClientId: 'test-client' });
    expect((await request(app).post('/api/auth/google').send({ credential: 'unverified' })).status).toBe(401);
    expect((await request(app).post('/api/auth/google').send({ credential: 'invalid' })).status).toBe(401);
    const linked = await request(app).post('/api/auth/google').send({ credential: 'link' });
    expect(linked.body.user.id).toBe(userId);
    // A legacy password (from before D22) is dropped when Google proves the address.
    expect(
      (await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId])).rows[0].password_hash,
    ).toBeNull();
    const bySub = await request(app).post('/api/auth/google').send({ credential: 'other' });
    expect(bySub.body.user.id).toBe(userId);
    const disabled = createApp({ pool, jwtSecret: secret });
    expect((await request(disabled).get('/api/auth/config')).body.googleClientId).toBeNull();
    expect((await request(disabled).post('/api/auth/google').send({ credential: 'x' })).status).toBe(404);
  });
  it('creates new users from Google', async () => {
    const isolated = createApp({
      pool,
      jwtSecret: secret,
      googleClientId: 'test-client',
      googleVerifier: async () => ({
        sub: 'new-' + suffix,
        email: googleEmail,
        email_verified: true,
        iss: 'accounts.google.com',
        aud: 'test-client',
        iat: 1,
        exp: 2,
        picture: 'https://example.com/avatar.png',
      }),
    });
    const google = await request(isolated).post('/api/auth/google').send({ credential: 'ok' });
    expect(google.body.user).toMatchObject({
      email: googleEmail,
      avatarUrl: 'https://example.com/avatar.png',
    });
  });
});

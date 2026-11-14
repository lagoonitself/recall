import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createPool } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';
import { createApp } from '../src/index.js';

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
  it('registers, rejects duplicates, logs in, and reads me', async () => {
    const registered = await request(app)
      .post('/api/auth/register')
      .send({ email: '  ' + email.toUpperCase() + '  ', password: 'password123', name: 'Test' });
    expect(registered.status).toBe(201);
    expect(registered.body.user).toMatchObject({ email, avatarUrl: null });
    token = registered.body.token;
    userId = registered.body.user.id;
    expect(
      (await request(app).post('/api/auth/register').send({ email, password: 'password123' })).status,
    ).toBe(409);
    expect(
      (await request(app).post('/api/auth/login').send({ email, password: 'bad' })).body.error.message,
    ).toBe('Invalid email or password');
    expect((await request(app).post('/api/auth/login').send({ email, password: 'password123' })).status).toBe(
      200,
    );
    expect(
      (
        await request(app)
          .get('/api/auth/me')
          .set('Authorization', 'Bearer ' + token)
      ).body.user.id,
    ).toBe(userId);
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    const second = await request(app)
      .post('/api/auth/register')
      .send({ email: secondEmail, password: 'password123' });
    secondToken = second.body.token;
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
    // Pre-account-takeover guard: the password set before Google proved the address no longer works.
    const oldPassword = await request(app).post('/api/auth/login').send({ email, password: 'password123' });
    expect(oldPassword.status).toBe(401);
    expect(oldPassword.body.error.message).toBe('Invalid email or password');
    const bySub = await request(app).post('/api/auth/google').send({ credential: 'other' });
    expect(bySub.body.user.id).toBe(userId);
    const disabled = createApp({ pool, jwtSecret: secret });
    expect((await request(disabled).get('/api/auth/config')).body.googleClientId).toBeNull();
    expect((await request(disabled).post('/api/auth/google').send({ credential: 'x' })).status).toBe(404);
  });
  it('creates Google-only users and denies password login', async () => {
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
    const login = await request(isolated)
      .post('/api/auth/login')
      .send({ email: googleEmail, password: 'password123' });
    expect(login.status).toBe(401);
    expect(login.body.error.message).toBe('Invalid email or password');
  });
});

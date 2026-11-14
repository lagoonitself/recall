import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import type pg from 'pg';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../index.js';
import { hashPassword, verifyPassword } from './auth.js';

type Row = {
  id: string;
  email: string;
  password_hash: string | null;
  google_sub: string | null;
  name: string | null;
  avatar_url: string | null;
  created_at: Date;
};

/** Just enough of the `users` table for the auth routes, so these tests need no database. */
function fakeUsers() {
  const rows: Row[] = [];
  const result = (found: Row[]) => ({ rows: found, rowCount: found.length });
  const query = async (sql: string, values: unknown[] = []) => {
    const [first, second, third, fourth] = values as (string | null)[];
    if (sql.startsWith('INSERT INTO users(email, password_hash, name)')) {
      if (rows.some((row) => row.email === first))
        throw Object.assign(new Error('duplicate'), { code: '23505' });
      const row: Row = {
        id: randomUUID(),
        email: first!,
        password_hash: second,
        google_sub: null,
        name: third,
        avatar_url: null,
        created_at: new Date(),
      };
      rows.push(row);
      return result([row]);
    }
    if (sql.startsWith('INSERT INTO users(email, google_sub')) {
      // Mirrors the ON CONFLICT (email) upsert: link only when not linked to another Google account.
      const existing = rows.find((row) => row.email === first);
      if (!existing) {
        const row: Row = {
          id: randomUUID(),
          email: first!,
          password_hash: null,
          google_sub: second,
          name: third,
          avatar_url: fourth,
          created_at: new Date(),
        };
        rows.push(row);
        return result([row]);
      }
      if (existing.google_sub && existing.google_sub !== second) return result([]);
      Object.assign(existing, { google_sub: second, password_hash: null });
      return result([existing]);
    }
    if (sql === 'SELECT * FROM users WHERE email = $1')
      return result(rows.filter((row) => row.email === first));
    if (sql === 'UPDATE users SET password_hash = $1 WHERE id = $2') {
      const row = rows.find((candidate) => candidate.id === second);
      if (row) row.password_hash = first;
      return result(row ? [row] : []);
    }
    if (sql === 'SELECT * FROM users WHERE id = $1') return result(rows.filter((row) => row.id === first));
    if (sql === 'SELECT * FROM users WHERE google_sub = $1')
      return result(rows.filter((row) => row.google_sub === first));
    throw new Error('Unexpected SQL in auth test: ' + sql);
  };
  return { rows, pool: { query } as unknown as pg.Pool };
}

const secret = 'unit-test-secret-'.repeat(3);
function setup(googleEmail = 'reader@example.com') {
  const users = fakeUsers();
  const app = createApp({
    pool: users.pool,
    jwtSecret: secret,
    googleClientId: 'test-client',
    googleVerifier: async () => ({
      sub: 'google-1',
      email: googleEmail,
      email_verified: true,
      iss: 'accounts.google.com',
      aud: 'test-client',
      iat: 1,
      exp: 2,
    }),
  });
  return { app, rows: users.rows };
}
/** A hash in the format used before the switch to bcrypt. */
function legacyScrypt(password: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${scryptSync(password, salt, 64).toString('base64')}`;
}
const register = (app: ReturnType<typeof createApp>, body: object) =>
  request(app).post('/api/auth/register').send(body);
const login = (app: ReturnType<typeof createApp>, body: object) =>
  request(app).post('/api/auth/login').send(body);

describe('password hashing', () => {
  it('stores a salted bcrypt hash and verifies only the right password', async () => {
    const first = await hashPassword('password123');
    const second = await hashPassword('password123');
    expect(first).toMatch(/^\$2[aby]\$12\$.{53}$/);
    expect(first).not.toBe(second);
    expect(first).not.toContain('password123');
    expect(await verifyPassword('password123', first)).toBe(true);
    expect(await verifyPassword('password124', first)).toBe(false);
    expect(await verifyPassword('', first)).toBe(false);
  });
  it('still verifies a legacy scrypt hash', async () => {
    const stored = legacyScrypt('password123');
    expect(await verifyPassword('password123', stored)).toBe(true);
    expect(await verifyPassword('password124', stored)).toBe(false);
  });
  it('rejects malformed or foreign hashes instead of throwing', async () => {
    for (const stored of [
      '',
      'legacy-hash',
      'bcrypt$abc$def',
      '$2b$12$tooshort',
      'scrypt$only-salt',
      'scrypt$c2FsdA==$c2hvcnQ=',
    ])
      expect(await verifyPassword('password123', stored)).toBe(false);
  });
});

describe('POST /api/auth/register', () => {
  it('rejects passwords longer than bcrypt can read (72 bytes)', async () => {
    const { app } = setup();
    expect((await register(app, { email: 'long@example.com', password: 'a'.repeat(73) })).status).toBe(400);
    expect((await register(app, { email: 'ok@example.com', password: 'a'.repeat(72) })).status).toBe(201);
  });
  it('creates an account, trims and lower-cases the email, and returns a working session', async () => {
    const { app, rows } = setup();
    const response = await register(app, {
      email: '  New@Example.COM ',
      password: 'password123',
      name: ' Ada ',
    });
    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({ email: 'new@example.com', name: 'Ada', avatarUrl: null });
    expect(response.body.user).not.toHaveProperty('password_hash');
    expect(response.body.user).not.toHaveProperty('passwordHash');
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$12\$/);
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer ' + response.body.token);
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(response.body.user.id);
  });
  it('treats a blank name as no name', async () => {
    const { app } = setup();
    const response = await register(app, { email: 'a@example.com', password: 'password123', name: '   ' });
    expect(response.body.user.name).toBeNull();
  });
  it('refuses an email that is already registered, whatever its case', async () => {
    const { app } = setup();
    await register(app, { email: 'a@example.com', password: 'password123' });
    const again = await register(app, { email: 'A@EXAMPLE.com', password: 'different-pass' });
    expect(again.status).toBe(409);
    expect(again.body.error.message).toBe('Email already registered');
  });
  it.each([
    ['missing email', { password: 'password123' }],
    ['invalid email', { email: 'not-an-email', password: 'password123' }],
    ['short password', { email: 'a@example.com', password: '1234567' }],
    ['overlong password', { email: 'a@example.com', password: 'x'.repeat(201) }],
    ['missing password', { email: 'a@example.com' }],
  ])('rejects %s with 400 and creates nothing', async (_name, body) => {
    const { app, rows } = setup();
    expect((await register(app, body)).status).toBe(400);
    expect(rows).toHaveLength(0);
  });
  it('accepts a password of exactly 8 characters', async () => {
    const { app } = setup();
    expect((await register(app, { email: 'a@example.com', password: '12345678' })).status).toBe(201);
  });
});

describe('POST /api/auth/login', () => {
  it('upgrades a legacy scrypt hash to bcrypt after a successful sign-in', async () => {
    const { app, rows } = setup();
    await register(app, { email: 'old@example.com', password: 'password123' });
    rows[0].password_hash = legacyScrypt('password123');
    expect((await login(app, { email: 'old@example.com', password: 'wrong-pass' })).status).toBe(401);
    expect(rows[0].password_hash).toMatch(/^scrypt\$/);
    expect((await login(app, { email: 'old@example.com', password: 'password123' })).status).toBe(200);
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$12\$/);
    expect((await login(app, { email: 'old@example.com', password: 'password123' })).status).toBe(200);
  });
  it('signs in with the right password, ignoring email case and spaces', async () => {
    const { app } = setup();
    const created = await register(app, { email: 'a@example.com', password: 'password123' });
    const response = await login(app, { email: ' A@Example.com ', password: 'password123' });
    expect(response.status).toBe(200);
    expect(response.body.user.id).toBe(created.body.user.id);
    expect(typeof response.body.token).toBe('string');
  });
  it('gives the same answer for a wrong password and an unknown email', async () => {
    const { app } = setup();
    await register(app, { email: 'a@example.com', password: 'password123' });
    const wrong = await login(app, { email: 'a@example.com', password: 'password124' });
    const unknown = await login(app, { email: 'nobody@example.com', password: 'password123' });
    for (const response of [wrong, unknown]) {
      expect(response.status).toBe(401);
      expect(response.body.error).toMatchObject({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
      expect(response.body).not.toHaveProperty('token');
    }
  });
  it('does not let a Google-only account sign in with a password', async () => {
    const { app } = setup('google@example.com');
    expect((await request(app).post('/api/auth/google').send({ credential: 'x' })).status).toBe(200);
    const response = await login(app, { email: 'google@example.com', password: 'password123' });
    expect(response.status).toBe(401);
  });
  it('drops the password once Google links the same email', async () => {
    const { app, rows } = setup('a@example.com');
    const created = await register(app, { email: 'a@example.com', password: 'password123' });
    const google = await request(app).post('/api/auth/google').send({ credential: 'x' });
    expect(google.body.user.id).toBe(created.body.user.id);
    expect(rows[0].password_hash).toBeNull();
    expect((await login(app, { email: 'a@example.com', password: 'password123' })).status).toBe(401);
  });
  it('rejects an empty password with 400', async () => {
    const { app } = setup();
    expect((await login(app, { email: 'a@example.com', password: '' })).status).toBe(400);
  });
  it('rate limits repeated attempts', async () => {
    const { app } = setup();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++)
      statuses.push((await login(app, { email: 'a@example.com', password: 'guess-' + i })).status);
    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

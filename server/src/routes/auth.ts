import { Router } from 'express';
import bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import type pg from 'pg';
import { z } from 'zod';
import { GoogleLoginRequestSchema, LoginRequestSchema, RegisterRequestSchema } from '@app/shared';
import { validateBody } from '../lib/validation.js';
import { HttpError } from '../lib/errors.js';
import { requireAuth, signToken } from '../lib/auth.js';
import { rateLimit } from '../lib/rateLimit.js';

export type GoogleVerifier = (credential: string, audience: string) => Promise<TokenPayload | undefined>;
export const verifyGoogle: GoogleVerifier = async (credential, audience) =>
  (await new OAuth2Client().verifyIdToken({ idToken: credential, audience })).getPayload();
type UserRow = {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: Date;
  password_hash: string | null;
};
const publicUser = (row: UserRow) => ({
  id: row.id,
  email: row.email,
  name: row.name,
  avatarUrl: row.avatar_url,
  createdAt: row.created_at.toISOString(),
});
const digest = (password: string) => createHash('sha256').update(password).digest('base64');
const invalid = () => new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
const registration = RegisterRequestSchema.extend({ email: z.string().trim().email() });
const login = LoginRequestSchema.extend({ email: z.string().trim().email() });
const duplicate = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';

export function authRouter(
  pool: () => pg.Pool,
  secret: string,
  googleClientId?: string,
  verifier: GoogleVerifier = verifyGoogle,
) {
  const router = Router();
  const limiter = rateLimit({ limit: 10, windowMs: 60_000 });
  const respond = (row: UserRow) => ({ token: signToken(row.id, secret), user: publicUser(row) });
  router.get('/config', (_req, res) => res.json({ googleClientId: googleClientId || null }));
  router.post('/register', limiter, validateBody(registration), async (req, res) => {
    const { email, password, name } = registration.parse(req.body);
    const hash = await bcrypt.hash(digest(password), 12);
    try {
      const result = await pool().query(
        'INSERT INTO users(email, password_hash, name) VALUES ($1,$2,$3) RETURNING *',
        [email.trim().toLowerCase(), hash, name ?? null],
      );
      res.status(201).json(respond(result.rows[0]));
    } catch (error) {
      if (duplicate(error)) throw new HttpError(409, 'CONFLICT', 'Email already registered');
      throw error;
    }
  });
  router.post('/login', limiter, validateBody(login), async (req, res) => {
    const { email, password } = login.parse(req.body);
    const result = await pool().query('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    const user: UserRow | undefined = result.rows[0];
    if (!user?.password_hash || !(await bcrypt.compare(digest(password), user.password_hash)))
      throw invalid();
    res.json(respond(user));
  });
  router.post('/google', limiter, validateBody(GoogleLoginRequestSchema), async (req, res) => {
    if (!googleClientId) throw new HttpError(404, 'NOT_FOUND', 'Google sign-in is disabled');
    let payload: TokenPayload | undefined;
    try {
      payload = await verifier(req.body.credential, googleClientId);
    } catch {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid Google credential');
    }
    if (!payload?.sub || !payload.email || payload.email_verified !== true)
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid Google credential');
    const email = payload.email.trim().toLowerCase();
    const existing = await pool().query('SELECT * FROM users WHERE google_sub = $1', [payload.sub]);
    if (existing.rowCount) return res.json(respond(existing.rows[0]));
    try {
      const result = await pool().query(
        'INSERT INTO users(email, google_sub, name, avatar_url) VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO UPDATE SET google_sub = EXCLUDED.google_sub WHERE users.google_sub IS NULL OR users.google_sub = EXCLUDED.google_sub RETURNING *',
        [email, payload.sub, payload.name ?? null, payload.picture ?? null],
      );
      if (!result.rowCount) throw new HttpError(409, 'CONFLICT', 'Account already linked');
      res.json(respond(result.rows[0]));
    } catch (error) {
      if (duplicate(error)) {
        const result = await pool().query('SELECT * FROM users WHERE google_sub = $1', [payload.sub]);
        if (result.rowCount) return res.json(respond(result.rows[0]));
        throw new HttpError(409, 'CONFLICT', 'Account already linked');
      }
      throw error;
    }
  });
  router.get('/me', requireAuth(secret), async (req, res) => {
    const result = await pool().query('SELECT * FROM users WHERE id = $1', [req.user!.id]);
    if (!result.rowCount) throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required');
    res.json({ user: publicUser(result.rows[0]) });
  });
  return router;
}

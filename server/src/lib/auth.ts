import jwt from 'jsonwebtoken';
import type { RequestHandler } from 'express';
import { HttpError } from './errors.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: { id: string };
  }
}

export function requireAuth(secret: string): RequestHandler {
  return (req, _res, next) => {
    const match = /^Bearer (\S+)$/i.exec(req.get('authorization') ?? '');
    try {
      if (!match || secret.length < 32) throw new Error();
      const payload = jwt.verify(match[1], secret, { algorithms: ['HS256'] });
      if (
        typeof payload === 'string' ||
        typeof payload.sub !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.sub)
      )
        throw new Error();
      req.user = { id: payload.sub };
      next();
    } catch {
      next(new HttpError(401, 'UNAUTHORIZED', 'Authentication required'));
    }
  };
}
export function signToken(id: string, secret: string) {
  if (secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
  return jwt.sign({}, secret, { subject: id, expiresIn: '7d', algorithm: 'HS256' });
}

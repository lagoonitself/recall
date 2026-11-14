import type { RequestHandler } from 'express';
import { HttpError } from './errors.js';

export function rateLimit(options: { limit: number; windowMs: number }): RequestHandler {
  const entries = new Map<string, { count: number; expires: number }>();
  return (req, _res, next) => {
    const now = Date.now();
    for (const [key, entry] of entries) if (entry.expires <= now) entries.delete(key);
    const key = req.user?.id ?? req.ip ?? 'unknown';
    const entry = entries.get(key) ?? { count: 0, expires: now + options.windowMs };
    entry.count++;
    entries.set(key, entry);
    if (entry.count > options.limit) return next(new HttpError(429, 'RATE_LIMITED', 'Too many requests'));
    next();
  };
}

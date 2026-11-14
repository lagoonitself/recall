import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './lib/config.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import { healthRouter } from './routes/health.js';
import type pg from 'pg';
import { getPool } from './db/index.js';
import { authRouter, type GoogleVerifier } from './routes/auth.js';
import { collectionsRouter } from './routes/collections.js';
import { filesRouter, type FileLimits } from './routes/files.js';
import { chunksRouter } from './routes/chunks.js';
import { createR2, type R2 } from './lib/r2.js';

export type AppOptions = {
  corsOrigin?: string;
  pool?: pg.Pool;
  jwtSecret?: string;
  googleClientId?: string;
  googleVerifier?: GoogleVerifier;
  storage?: R2;
  fileLimits?: FileLimits;
};

/** Builds the Express app. Never connects to the DB here, so tests can build it without env. */
export function createApp(options: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  // Render and Vercel sit one proxy hop in front; without this every client shares the proxy IP in rate limits.
  app.set('trust proxy', 1);
  app.use(cors({ origin: options.corsOrigin ?? false }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', healthRouter);
  const pool = () => options.pool ?? getPool();
  const secret = options.jwtSecret ?? process.env.JWT_SECRET ?? '';
  app.use('/api/auth', authRouter(pool, secret, options.googleClientId, options.googleVerifier));
  app.use('/api/collections', collectionsRouter(pool, secret));
  let storage = options.storage;
  const getStorage = () => (storage ??= createR2());
  app.use(
    '/api/files',
    filesRouter(
      pool,
      secret,
      getStorage,
      options.fileLimits ?? { maxFileMb: 50, userQuotaMb: 500, uploadsPerDay: 100 },
    ),
  );
  app.use('/api/chunks', chunksRouter(pool, secret, getStorage));
  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig();
  createApp({
    corsOrigin: config.CORS_ORIGIN,
    jwtSecret: config.JWT_SECRET,
    googleClientId: config.GOOGLE_CLIENT_ID,
    fileLimits: {
      maxFileMb: config.MAX_FILE_MB,
      userQuotaMb: config.USER_QUOTA_MB,
      uploadsPerDay: config.UPLOADS_PER_DAY,
    },
  }).listen(config.PORT, () => {
    console.log(`Recall API listening on ${config.PORT}`);
  });
}

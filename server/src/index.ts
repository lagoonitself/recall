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
import { conversationsRouter, type ChatDeps } from './routes/conversations.js';
import { searchLibrary } from './retrieval/search.js';
import { probeDuration } from './ingest/splitters/media.js';
import { createR2, type R2 } from './lib/r2.js';
import { embedMedia, embedText } from './lib/embed.js';
import { getDescribeProvider, getProvider } from './agent/provider/index.js';
import { startWorker } from './ingest/worker.js';
import { documentsRouter } from './routes/documents.js';
import { DocumentQueue } from './documents/queue.js';
import { getDocumentAI } from './agent/provider/documents.js';

let documentQueue: DocumentQueue | undefined;
/** One queue per process, shared by the API routes and the ingest worker. */
export function getDocumentQueue() {
  return (documentQueue ??= new DocumentQueue({
    pool: getPool(),
    storage: createR2(),
    ai: getDocumentAI(),
    search: searchLibrary,
  }));
}

export type AppOptions = {
  corsOrigin?: string;
  pool?: pg.Pool;
  jwtSecret?: string;
  googleClientId?: string;
  googleVerifier?: GoogleVerifier;
  storage?: R2;
  fileLimits?: FileLimits;
  chat?: Partial<ChatDeps>;
  documents?: () => DocumentQueue;
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
  let storage = options.storage;
  const getStorage = () => (storage ??= createR2());
  app.use('/api/collections', collectionsRouter(pool, secret, getStorage));
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
  app.use(
    '/api/conversations',
    conversationsRouter(pool, secret, getStorage, {
      provider: () => getProvider(),
      model: process.env.AGENT_MODEL || 'fake',
      search: searchLibrary,
      probeDuration,
      chatPerMin: Number(process.env.CHAT_PER_MIN || 6),
      ...options.chat,
    }),
  );
  app.use('/api/documents', documentsRouter(pool, secret, options.documents ?? getDocumentQueue));
  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig();
  const app = createApp({
    corsOrigin: config.CORS_ORIGIN,
    jwtSecret: config.JWT_SECRET,
    googleClientId: config.GOOGLE_CLIENT_ID,
    fileLimits: {
      maxFileMb: config.MAX_FILE_MB,
      userQuotaMb: config.USER_QUOTA_MB,
      uploadsPerDay: config.UPLOADS_PER_DAY,
    },
    chat: { model: config.AGENT_MODEL ?? 'fake', chatPerMin: config.CHAT_PER_MIN },
  });
  const server = app.listen(config.PORT, () => {
    console.log(`Recall API listening on ${config.PORT}`);
  });
  const worker = config.RUN_WORKER
    ? startWorker(
        {
          pool: getPool(),
          storage: createR2(),
          embedText,
          embedMedia,
          describer: { provider: getDescribeProvider(), model: config.DESCRIBE_MODEL ?? 'fake' },
          audioPieceSec: config.AUDIO_PIECE_SEC,
          describeBatch: config.DESCRIBE_BATCH,
        },
        {
          concurrency: config.WORKER_CONCURRENCY,
          onFileReady: (fileId) => getDocumentQueue().fileReady(fileId),
        },
      )
    : undefined;
  if (worker) {
    console.log(`Ingestion worker started (concurrency ${config.WORKER_CONCURRENCY})`);
    void getDocumentQueue()
      .resume()
      .catch((error) => console.error('could not resume document analysis', String(error)));
  }
  // Render sends SIGTERM on deploy: finish the current piece, requeue the job, then exit.
  for (const signal of ['SIGTERM', 'SIGINT'] as const)
    process.once(signal, () => {
      console.log(`${signal}: shutting down`);
      server.close();
      void (worker?.stop() ?? Promise.resolve()).finally(() => process.exit(0));
    });
}

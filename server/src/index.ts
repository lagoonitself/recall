import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './lib/config.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import { healthRouter } from './routes/health.js';

export type AppOptions = { corsOrigin?: string };

/** Builds the Express app. Never connects to the DB here, so tests can build it without env. */
export function createApp(options: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: options.corsOrigin ?? false }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', healthRouter);
  // Later parts mount their routers here, above the 404 handler.
  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig();
  createApp({ corsOrigin: config.CORS_ORIGIN }).listen(config.PORT, () => {
    console.log(`Recall API listening on ${config.PORT}`);
  });
}

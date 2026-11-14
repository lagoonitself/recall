import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './lib/config.js';
import { errorHandler } from './lib/errors.js';
import { healthRouter } from './routes/health.js';
export function createApp(options: { corsOrigin?: string } = {}) {
 const app = express();
 app.use(cors({ origin: options.corsOrigin ?? false }));
 app.use(express.json());
 app.use('/api', healthRouter);
 app.use(errorHandler);
 return app;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 const config = loadConfig();
 createApp({ corsOrigin: config.CORS_ORIGIN }).listen(config.PORT, () => console.log(`Listening on ${config.PORT}`));
}

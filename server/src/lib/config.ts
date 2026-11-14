import { z } from 'zod';
const positive = z.coerce.number().int().positive();
export const ConfigSchema = z.object({
 PORT: positive.default(3000), DATABASE_URL: z.string().url(), JWT_SECRET: z.string().min(1), CORS_ORIGIN: z.string().url(), GEMINI_API_KEY: z.string().min(1),
 EMBED_MODEL: z.literal('gemini-embedding-2'), EMBED_DIM: z.coerce.number().pipe(z.literal(1536)), EMBED_RPM: positive, EMBED_CONCURRENCY: positive,
 LLM_PROVIDER: z.string().min(1), LLM_API_KEY: z.string().optional(), LLM_BASE_URL: z.string().url().optional(), AGENT_MODEL: z.string().min(1), DESCRIBE_MODEL: z.string().min(1), LLM_CONCURRENCY: positive, DESCRIBE_BATCH: positive,
 R2_ACCOUNT_ID: z.string().min(1), R2_ACCESS_KEY_ID: z.string().min(1), R2_SECRET_ACCESS_KEY: z.string().min(1), R2_BUCKET: z.string().min(1), AUDIO_PIECE_SEC: positive, WORKER_CONCURRENCY: positive,
 MAX_FILE_MB: positive, USER_QUOTA_MB: positive, UPLOADS_PER_DAY: positive, CHAT_PER_MIN: positive
});
export type Config = z.infer<typeof ConfigSchema>;
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config { return ConfigSchema.parse(env); }

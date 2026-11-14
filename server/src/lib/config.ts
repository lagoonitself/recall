import { z } from 'zod';

const positiveInt = z.coerce.number().int().positive();
const optionalString = z
  .string()
  .optional()
  .transform((v) => (v === '' ? undefined : v));

/**
 * Server configuration, validated once at startup (fail fast).
 * Defaults follow ARCHITECTURE §15. Credentials have no defaults.
 * R2 credentials stay optional until P2 needs them; LLM settings are optional
 * while LLM_PROVIDER=fake.
 */
export const ConfigSchema = z
  .object({
    PORT: positiveInt.default(3000),
    DATABASE_URL: z.string().url(),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    CORS_ORIGIN: z.string().url(),
    GOOGLE_CLIENT_ID: optionalString,

    GEMINI_API_KEY: z.string().min(1),
    EMBED_MODEL: z.literal('gemini-embedding-2').default('gemini-embedding-2'),
    EMBED_DIM: z.coerce.number().pipe(z.literal(1536)).default(1536),
    EMBED_RPM: positiveInt.default(60),
    EMBED_CONCURRENCY: positiveInt.default(2),

    LLM_PROVIDER: z.string().min(1).default('fake'),
    LLM_API_KEY: optionalString,
    LLM_BASE_URL: optionalString,
    AGENT_MODEL: optionalString,
    DESCRIBE_MODEL: optionalString,
    LLM_CONCURRENCY: positiveInt.default(2),
    DESCRIBE_BATCH: positiveInt.default(4),

    R2_ACCOUNT_ID: optionalString,
    R2_ACCESS_KEY_ID: optionalString,
    R2_SECRET_ACCESS_KEY: optionalString,
    R2_BUCKET: z.string().min(1).default('recall-files'),

    AUDIO_PIECE_SEC: positiveInt.default(150),
    WORKER_CONCURRENCY: positiveInt.default(1),
    MAX_FILE_MB: positiveInt.default(50),
    USER_QUOTA_MB: positiveInt.default(500),
    UPLOADS_PER_DAY: positiveInt.default(100),
    CHAT_PER_MIN: positiveInt.default(6),
  })
  .superRefine((c, ctx) => {
    if (c.LLM_PROVIDER === 'fake') return;
    for (const key of ['LLM_API_KEY', 'AGENT_MODEL', 'DESCRIBE_MODEL'] as const) {
      if (!c[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required when LLM_PROVIDER is not "fake"`,
        });
      }
    }
  });

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid server configuration:\n${lines.join('\n')}`);
  }
  return result.data;
}

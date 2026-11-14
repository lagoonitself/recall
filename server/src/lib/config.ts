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

    LLM_PROVIDER: z.enum(['fake', 'gemini', 'openrouter', 'opencode']).default('fake'),
    DESCRIBE_PROVIDER: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z.enum(['fake', 'gemini', 'openrouter', 'opencode']).optional(),
    ),
    OPENROUTER_API_KEY: optionalString,
    OPENCODE_API_KEY: optionalString,
    OPENCODE_BASE_URL: optionalString,
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
    const describeProvider = c.DESCRIBE_PROVIDER ?? c.LLM_PROVIDER;
    const required = new Set<
      'OPENROUTER_API_KEY' | 'OPENCODE_API_KEY' | 'OPENCODE_BASE_URL' | 'AGENT_MODEL' | 'DESCRIBE_MODEL'
    >();
    for (const provider of [c.LLM_PROVIDER, describeProvider]) {
      if (provider === 'openrouter') required.add('OPENROUTER_API_KEY');
      if (provider === 'opencode') {
        required.add('OPENCODE_API_KEY');
        required.add('OPENCODE_BASE_URL');
      }
    }
    if (c.LLM_PROVIDER !== 'fake') required.add('AGENT_MODEL');
    if (describeProvider !== 'fake') required.add('DESCRIBE_MODEL');
    for (const key of required) {
      if (!c[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} is required for the selected provider`,
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

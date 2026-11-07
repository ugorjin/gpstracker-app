import { z } from 'zod';

/**
 * All runtime configuration comes from environment variables.
 * See `.env.example` for descriptions of each setting.
 */
const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().min(1),

  // --- Vendor platform API ---
  VENDOR_API_BASE_URL: z.string().url(),
  VENDOR_API_PATH: z.string().default('/openapi'),
  VENDOR_USERNAME: z.string().min(1),
  /** Plain-text password; hashed with MD5 before it is sent, as the vendor requires. */
  VENDOR_PASSWORD: z.string().min(1),
  /** Default timezone offset (hours) sent to report endpoints. Nigeria (WAT) is +1. */
  VENDOR_TIMEZONE: z.coerce.number().int().min(-12).max(14).default(1),
  /** Fixed command password used by `sendcmd` (vendor default is "zhuyi"). */
  VENDOR_COMMAND_PASSWORD: z.string().default('zhuyi'),
  /** Requests per minute from our server IP. Vendor hard limit is 10. */
  VENDOR_RATE_PER_MINUTE: z.coerce.number().int().positive().max(10).default(8),
  /** Daily account budget: 1440 + 5 × paid devices. Set to your real figure. */
  VENDOR_DAILY_BUDGET: z.coerce.number().int().positive().default(1440),

  // --- Push receiver ("Http Sign Json" forwarding) ---
  PUSH_APP_ID: z.string().min(1),
  PUSH_APP_SECRET: z.string().min(1),
  /** Accept pushes with no signature headers. Keep false in production. */
  PUSH_ALLOW_UNSIGNED: bool.default('false'),
  PUSH_TIMESTAMP_TOLERANCE_MS: z.coerce.number().int().positive().default(5 * 60 * 1000),
  /** Store every raw push body for audit/replay. */
  PUSH_STORE_RAW: bool.default('true'),

  // --- Dashboard API ---
  /** Comma-separated browser origins allowed to call /api, e.g. https://app.example.com */
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
  /** Country (ISO-2) assumed for phone numbers typed without a country code. */
  DEFAULT_COUNTRY: z.string().regex(/^[A-Za-z]{2}$/).transform((s) => s.toUpperCase()).default('NG'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  /** No push received for this long = device shown as offline. */
  OFFLINE_AFTER_MINUTES: z.coerce.number().int().min(1).default(30),
  /** Built web dashboard to serve at / (e.g. ../web/dist). Empty = API only. */
  WEB_DIST_DIR: z.string().optional(),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  return parsed.data;
}

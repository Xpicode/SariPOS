import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.url(),
  // The .env.example placeholder is 36 chars, so min(32) alone would accept a PUBLIC secret.
  JWT_ACCESS_SECRET: z
    .string()
    .min(32)
    .refine(
      (s) => !s.startsWith('generate_with'),
      'Replace the placeholder: openssl rand -base64 48',
    ),
  CLIENT_ORIGIN: z.url(),
  ACCESS_TOKEN_TTL: z
    .string()
    .regex(/^\d+[smhd]$/, 'Use a duration like 15m')
    .default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  // How many proxies stand between the internet and this server (see app.ts). 0 = none (local).
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  // Public demo: user accounts can't be changed, so no visitor can lock the others out.
  DEMO_MODE: z.stringbool().default(false),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:\n' + z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;

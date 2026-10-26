import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().optional().transform((val) => (val && val.trim() !== '' ? val : undefined)),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  CORS_ORIGIN: z.string().min(1, 'CORS_ORIGIN is required'),
  APP_BASE_URL: z.string().url('APP_BASE_URL must be a valid URL'),
  API_BASE_URL: z.string().url('API_BASE_URL must be a valid URL'),
  PAYMENT_PROVIDERS: z.string().default('chapa,simulated'),
  CHAPA_SECRET_KEY: z.string().optional(),
  CHAPA_WEBHOOK_SECRET: z.string().optional(),
  DEMO_MODE: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .default(false)
    .transform((val) => val === true || val === 'true'),
  SIMULATED_WEBHOOK_SECRET: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, unknown> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Environment validation failed. Server cannot boot:\n${issues}`);
  }
  return result.data;
}

export const env = parseEnv();

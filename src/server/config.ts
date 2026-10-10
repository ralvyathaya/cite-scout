import { z } from 'zod';

const configSchema = z.object({
  APP_URL: z.url(),
  APP_ENV: z.enum(['development', 'test', 'production']),
  EXTERNAL_INTEGRATIONS_ENABLED: z.enum(['true', 'false']),
  V2_SCANS_ENABLED: z.enum(['true', 'false']).default('false'),
  GEO_SCANS_ENABLED: z.enum(['true', 'false']).default('false'),
  GEO_GLOBAL_DAILY_CALL_CAP: z.coerce.number().int().nonnegative().default(0),
  GEO_PROJECT_DAILY_CALL_CAP: z.coerce.number().int().nonnegative().default(0),
  GEO_PROJECT_MONTHLY_CALL_CAP: z.coerce.number().int().nonnegative().default(0),
  TEST_AUTH_ENABLED: z.enum(['true', 'false']),
  GLOBAL_DAILY_PROVIDER_CALL_CAP: z.coerce.number().int().positive(),
  PER_USER_MONTHLY_PROVIDER_CALL_CAP: z.coerce.number().int().positive(),
  MAX_PROVIDER_CALLS_PER_CRON_INVOCATION: z.coerce.number().int().positive(),
  LEMON_SQUEEZY_TEST_MODE: z.enum(['true', 'false']),
  LEMON_SQUEEZY_STORE_ID: z.string(),
  LEMON_SQUEEZY_PRODUCT_ID: z.string(),
  LEMON_SQUEEZY_VARIANT_ID: z.string(),
  LEMON_SQUEEZY_STORE_HOST: z.string(),
  TURNSTILE_SITE_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().min(1),
  OPERATOR_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
});

export function getConfig(env: CloudflareBindings) {
  const config = configSchema.parse(env);
  if (
    config.GEO_SCANS_ENABLED === 'true' &&
    (config.GEO_GLOBAL_DAILY_CALL_CAP === 0 ||
      config.GEO_PROJECT_DAILY_CALL_CAP === 0 ||
      config.GEO_PROJECT_MONTHLY_CALL_CAP === 0)
  )
    throw new Error('GEO_BUDGET_REQUIRED');
  if (config.APP_ENV === 'production' && config.TEST_AUTH_ENABLED === 'true')
    throw new Error('TEST_AUTH_MUST_BE_DISABLED');
  if (
    config.APP_ENV === 'production' &&
    (!config.OPERATOR_SECRET || config.OPERATOR_SECRET.length < 32)
  )
    throw new Error('OPERATOR_SECRET_REQUIRED');
  return config;
}

export function globalCollectorCallCap(env: CloudflareBindings): number {
  const legacy = Number(env.GLOBAL_DAILY_PROVIDER_CALL_CAP);
  return env.GEO_SCANS_ENABLED === 'true'
    ? Math.min(legacy, Number(env.GEO_GLOBAL_DAILY_CALL_CAP) || 0)
    : legacy;
}

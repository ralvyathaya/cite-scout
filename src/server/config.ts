import { z } from 'zod';
import { readGeoTestLimits } from '../shared/geo-test-limits';

const configSchema = z.object({
  APP_URL: z.url(),
  APP_ENV: z.enum(['development', 'test', 'production']),
  DEPLOYMENT_ENV: z.enum(['local', 'staging', 'production']).default('local'),
  EXTERNAL_INTEGRATIONS_ENABLED: z.enum(['true', 'false']),
  V2_SCANS_ENABLED: z.enum(['true', 'false']).default('false'),
  GEO_SCANS_ENABLED: z.enum(['true', 'false']).default('false'),
  GEO_ANALYSIS_ENABLED: z.enum(['true', 'false']).default('false'),
  GEO_CLASSIFIER_MODEL: z.enum(['clef-flash', 'clef', 'jev-1.13.0']).default('clef-flash'),
  GEO_SERP_COLLECTOR: z.enum(['serpapi', 'dataforseo_standard']).default('serpapi'),
  GEO_OPENAI_MODEL: z.string().min(1).max(100).default('gpt-6-luna'),
  GEO_INTERNAL_TEST_USER_ID: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{0,100}$/)
    .default(''),
  GEO_INTERNAL_TEST_EXPIRES_AT: z.string().default(''),
  GEO_SERPAPI_MONTHLY_REQUEST_CAP: z.coerce.number().int().nonnegative().default(0),
  GEO_INTERNAL_TEST_LIMITS: z.string().default(''),
  GEO_INTERNAL_TEST_SPEND_CAP_USD: z.coerce.number().nonnegative().default(0),
  GEO_INTERNAL_TEST_PERPLEXITY_MAX_COST_USD: z.coerce.number().nonnegative().default(0),
  GEO_INTERNAL_TEST_OPENAI_MAX_COST_USD: z.coerce.number().nonnegative().default(0),
  GEO_INTERNAL_TEST_PROCESSING_MAX_COST_USD: z.coerce.number().nonnegative().default(0),
  GEO_PROCESSING_PROJECT_DAILY_CAP: z.coerce.number().int().nonnegative().default(0),
  GEO_PROCESSING_GLOBAL_DAILY_CAP: z.coerce.number().int().nonnegative().default(0),
  GEO_PAGE_CHECKS_ENABLED: z.enum(['true', 'false']).default('false'),
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
  const internalTestLimits = readGeoTestLimits(config);
  if (config.GEO_INTERNAL_TEST_USER_ID || config.GEO_INTERNAL_TEST_EXPIRES_AT) {
    const expires = Date.parse(config.GEO_INTERNAL_TEST_EXPIRES_AT);
    if (
      config.DEPLOYMENT_ENV !== 'staging' ||
      new URL(config.APP_URL).hostname !== 'staging.cite-scout.com'
    )
      throw new Error('INTERNAL_TEST_STAGING_ONLY');
    if (
      !config.GEO_INTERNAL_TEST_USER_ID ||
      !Number.isFinite(expires) ||
      expires > Date.now() + 14 * 86_400_000
    )
      throw new Error('INVALID_INTERNAL_TEST_ACCESS');
  }
  if (config.APP_ENV === 'production' && config.TEST_AUTH_ENABLED === 'true')
    throw new Error('TEST_AUTH_MUST_BE_DISABLED');
  if (
    config.APP_ENV === 'production' &&
    (!config.OPERATOR_SECRET || config.OPERATOR_SECRET.length < 32)
  )
    throw new Error('OPERATOR_SECRET_REQUIRED');
  return { ...config, internalTestLimits };
}

export function internalTestUserId(env: CloudflareBindings, at = new Date()): string | null {
  const config = getConfig(env);
  return config.GEO_INTERNAL_TEST_USER_ID &&
    Date.parse(config.GEO_INTERNAL_TEST_EXPIRES_AT) > at.getTime()
    ? config.GEO_INTERNAL_TEST_USER_ID
    : null;
}

export function globalCollectorCallCap(env: CloudflareBindings): number {
  const legacy = Number(env.GLOBAL_DAILY_PROVIDER_CALL_CAP);
  return env.GEO_SCANS_ENABLED === 'true'
    ? Math.min(legacy, Number(env.GEO_GLOBAL_DAILY_CALL_CAP) || 0)
    : legacy;
}

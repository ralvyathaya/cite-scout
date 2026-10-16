import { z } from 'zod';
import bounds from './geo-test-limits.json';

const limitsSchema = z.strictObject({
  observations: z.number().int().nonnegative().max(bounds.maximum.observations),
  openai: z.number().int().nonnegative().max(bounds.maximum.openai),
  perplexity: z.number().int().nonnegative().max(bounds.maximum.perplexity),
  serpapi: z.number().int().nonnegative().max(bounds.maximum.serpapi),
  classifier: z.number().int().nonnegative().max(bounds.maximum.classifier),
});

export function readGeoTestLimits(config: {
  APP_URL: string;
  DEPLOYMENT_ENV: string;
  GEO_INTERNAL_TEST_LIMITS: string;
  GEO_INTERNAL_TEST_SPEND_CAP_USD: number;
}) {
  const override = config.GEO_INTERNAL_TEST_LIMITS.trim();
  const limits = override ? limitsSchema.parse(JSON.parse(override)) : bounds.legacy;
  if (
    override &&
    (config.DEPLOYMENT_ENV !== 'staging' ||
      new URL(config.APP_URL).hostname !== 'staging.cite-scout.com')
  )
    throw new Error('INTERNAL_TEST_STAGING_ONLY');
  const spendLimit = override ? bounds.maximumSpendUsd : bounds.legacySpendUsd;
  if (
    !Number.isFinite(config.GEO_INTERNAL_TEST_SPEND_CAP_USD) ||
    config.GEO_INTERNAL_TEST_SPEND_CAP_USD < 0 ||
    config.GEO_INTERNAL_TEST_SPEND_CAP_USD > spendLimit
  )
    throw new Error('INVALID_INTERNAL_TEST_SPEND_LIMIT');
  return limits;
}

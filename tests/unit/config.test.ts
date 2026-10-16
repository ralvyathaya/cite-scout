import { describe, expect, it } from 'vitest';
import { safeRedirect } from '../../src/domain/redirects';
import { readGeoTestLimits } from '../../src/shared/geo-test-limits';

const limits = { observations: 69, openai: 18, perplexity: 15, serpapi: 50, classifier: 85 };
function configured(overrides: Record<string, string> = {}) {
  return {
    internalTestLimits: readGeoTestLimits({
      GEO_INTERNAL_TEST_LIMITS: '',
      DEPLOYMENT_ENV: 'staging',
      APP_URL: 'https://staging.cite-scout.com',
      ...overrides,
      GEO_INTERNAL_TEST_SPEND_CAP_USD: Number(overrides.GEO_INTERNAL_TEST_SPEND_CAP_USD ?? 0),
    }),
  };
}

describe('cumulative owner-test ceilings', () => {
  it('preserves the legacy scope unless a complete bounded override is supplied', () => {
    expect(configured().internalTestLimits).toEqual({
      observations: 24,
      openai: 6,
      perplexity: 6,
      serpapi: 18,
      classifier: 24,
    });
    expect(
      configured({
        GEO_INTERNAL_TEST_LIMITS: JSON.stringify(limits),
        GEO_INTERNAL_TEST_SPEND_CAP_USD: '9.54',
      }).internalTestLimits,
    ).toEqual(limits);
  });
  it.each([
    '{}',
    '{broken',
    JSON.stringify({ ...limits, openai: -1 }),
    JSON.stringify({ ...limits, observations: 70 }),
    JSON.stringify({ ...limits, classifier: 85.5 }),
    JSON.stringify({ ...limits, extra: 1 }),
  ])('rejects incomplete, malformed, negative or excessive overrides: %s', (value) => {
    expect(() => configured({ GEO_INTERNAL_TEST_LIMITS: value })).toThrow();
  });
  it('rejects any override outside isolated staging and spending above the bound', () => {
    expect(() =>
      configured({
        GEO_INTERNAL_TEST_LIMITS: JSON.stringify(limits),
        DEPLOYMENT_ENV: 'production',
      }),
    ).toThrow('INTERNAL_TEST_STAGING_ONLY');
    expect(() => configured({ GEO_INTERNAL_TEST_SPEND_CAP_USD: '5.01' })).toThrow();
    expect(() =>
      configured({
        GEO_INTERNAL_TEST_LIMITS: JSON.stringify(limits),
        GEO_INTERNAL_TEST_SPEND_CAP_USD: '9.55',
      }),
    ).toThrow();
  });
});

describe('safe redirects', () => {
  it('accepts same-origin paths and blocks external origins', () => {
    expect(safeRedirect('/app/billing', 'https://citescout.example')).toBe(
      'https://citescout.example/app/billing',
    );
    expect(safeRedirect('https://evil.example/steal', 'https://citescout.example')).toBe(
      'https://citescout.example/app/overview',
    );
  });
});

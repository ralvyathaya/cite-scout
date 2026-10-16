import { expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { createExecutionContext } from 'cloudflare:test';
import { seed, withBindings, cookie } from './fixtures';
import { v2Routes } from '../../src/server/v2/routes';
import { saveGeoSettings } from '../../src/server/v2/geo-store';
import { geoCapabilities } from '../../src/server/v2/geo-readiness';
it.each([0, 1])(
  'reports the staging classifier allowance of %i without inference',
  (classifier) => {
    const run = vi.fn();
    const readiness = geoCapabilities({
      ...withBindings({
        APP_URL: 'https://staging.cite-scout.com',
        DEPLOYMENT_ENV: 'staging',
        EXTERNAL_INTEGRATIONS_ENABLED: 'true',
        GEO_ANALYSIS_ENABLED: 'true',
        GEO_PROCESSING_PROJECT_DAILY_CAP: '10',
        GEO_PROCESSING_GLOBAL_DAILY_CAP: '10',
        GEO_INTERNAL_TEST_SPEND_CAP_USD: '5',
        GEO_INTERNAL_TEST_PROCESSING_MAX_COST_USD: '0.002',
        GEO_INTERNAL_TEST_LIMITS: JSON.stringify({
          observations: 24,
          openai: 6,
          perplexity: 6,
          serpapi: 18,
          classifier,
        }),
      }),
      AI: { run } as unknown as Ai,
    });
    expect(readiness.classifier.available).toBe(classifier > 0);
    expect(readiness.classifier.reason).toBe(
      classifier
        ? null
        : 'Classification has no owner-test request allowance. Original answers remain readable.',
    );
    expect(run).not.toHaveBeenCalled();
  },
);
it('shows unavailable provider readiness without exposing secrets or blocking saved evidence at zero budget', async () => {
  const owner = await seed(1, true),
    env = withBindings({
      GEO_SCANS_ENABLED: 'true',
      GEO_GLOBAL_DAILY_CALL_CAP: '0',
      GEO_PROJECT_DAILY_CALL_CAP: '0',
      GEO_PROJECT_MONTHLY_CALL_CAP: '0',
    });
  const app = new Hono<{ Bindings: CloudflareBindings }>().route('/api/v2', v2Routes),
    headers = { Cookie: await cookie(owner.userId) };
  const response = await app.request(
    '/api/v2/geo/capabilities',
    { headers },
    env,
    createExecutionContext(),
  );
  expect(response.status).toBe(200);
  const payload = await response.json<{
    data: {
      engines: Record<string, { available: boolean; reason: string }>;
      classifier: { model: string; available: boolean };
    };
  }>();
  expect(payload.data.engines.google_aio?.available).toBe(false);
  expect(payload.data.classifier.model).toBe('clef-flash');
  expect(payload.data.classifier.available).toBe(false);
  expect(JSON.stringify(payload)).not.toContain('PERPLEXITY_API_KEY');
  expect(
    (await app.request('/api/v2/geo/observations', { headers }, env, createExecutionContext()))
      .status,
  ).toBe(200);
});
it('rejects unavailable collectors and fixture intent before reserving monitoring budget', async () => {
  const owner = await seed(1, true),
    env = withBindings({
      GEO_SCANS_ENABLED: 'true',
      V2_SCANS_ENABLED: 'true',
      EXTERNAL_INTEGRATIONS_ENABLED: 'true',
      GEO_GLOBAL_DAILY_CALL_CAP: '100',
      GEO_PROJECT_DAILY_CALL_CAP: '40',
      GEO_PROJECT_MONTHLY_CALL_CAP: '100',
      DATAFORSEO_LOGIN: '',
      DATAFORSEO_PASSWORD: '',
    });
  await saveGeoSettings(env, owner.userId, {
    engines: ['google_aio'],
    dailyEnabled: false,
    languageCode: 'en',
    locationCode: 2840,
    device: 'desktop',
  });
  const app = new Hono<{ Bindings: CloudflareBindings }>().route('/api/v2', v2Routes),
    headers = { Cookie: await cookie(owner.userId), 'Content-Type': 'application/json' };
  expect(
    (
      await app.request(
        '/api/v2/geo/runs',
        { method: 'POST', headers, body: JSON.stringify({ requestId: crypto.randomUUID() }) },
        env,
        createExecutionContext(),
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await app.request(
        '/api/v2/geo/runs',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ requestId: crypto.randomUUID(), fixture: true }),
        },
        env,
        createExecutionContext(),
      )
    ).status,
  ).toBe(422);
  expect(
    (
      await app.request(
        '/api/v2/scans',
        { method: 'POST', headers, body: JSON.stringify({ mode: 'today' }) },
        env,
        createExecutionContext(),
      )
    ).status,
  ).toBe(409);
  expect(
    await env.DB.prepare('SELECT COUNT(*) AS n FROM provider_call_reservations WHERE project_id=?')
      .bind(owner.projectId)
      .first('n'),
  ).toBe(0);
});

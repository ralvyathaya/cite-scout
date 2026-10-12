import { expect, it } from 'vitest';
import { Hono } from 'hono';
import { createExecutionContext } from 'cloudflare:test';
import { seed, withBindings, cookie } from './fixtures';
import { v2Routes } from '../../src/server/v2/routes';
import { saveGeoSettings } from '../../src/server/v2/geo-store';
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

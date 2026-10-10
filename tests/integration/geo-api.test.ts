import { Hono } from 'hono';
import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import { v2Routes } from '../../src/server/v2/routes';
import { cookie, seed, withBindings } from './fixtures';
import { processDueScans } from '../../src/server/v2/scans';
import { saveGeoSettings } from '../../src/server/v2/geo-store';

it('mounts GEO beneath the existing authenticated workspace and validates request bodies', async () => {
  const app = new Hono<{ Bindings: CloudflareBindings }>().route('/api/v2', v2Routes);
  const owner = await seed(1, true);
  const headers = { Cookie: await cookie(owner.userId), 'Content-Type': 'application/json' };
  expect((await app.request('/api/v2/geo/settings', {}, env)).status).toBe(401);
  const read = await app.request('/api/v2/geo/settings', { headers }, env);
  expect(read.status).toBe(200);
  const payload: unknown = await read.json();
  expect(payload).toMatchObject({ data: { projectId: owner.projectId, configured: false } });
  expect(
    (await app.request('/api/v2/geo/settings', { method: 'PUT', headers, body: '{' }, env)).status,
  ).toBe(422);
});

it('respects a configured GEO schedule without adding a legacy paid daily run', async () => {
  const now = new Date();
  const owner = await seed(1, true, now);
  const bindings = withBindings({
    GEO_SCANS_ENABLED: 'true',
    EXTERNAL_INTEGRATIONS_ENABLED: 'false',
    V2_SCANS_ENABLED: 'true',
    GEO_GLOBAL_DAILY_CALL_CAP: '100',
    GEO_PROJECT_DAILY_CALL_CAP: '40',
    GEO_PROJECT_MONTHLY_CALL_CAP: '100',
  });
  await env.DB.prepare('UPDATE projects SET v2_enabled_at=? WHERE id=?')
    .bind(now.getTime(), owner.projectId)
    .run();
  await env.DB.prepare(
    'INSERT INTO competitors(id,project_id,name,normalized_name,created_at,updated_at) VALUES(?,?,?,?,?,?)',
  )
    .bind(crypto.randomUUID(), owner.projectId, 'Rival', 'rival', now.getTime(), now.getTime())
    .run();
  await saveGeoSettings(
    bindings,
    owner.userId,
    {
      engines: ['google_aio'],
      dailyEnabled: false,
      languageCode: 'en',
      locationCode: 2840,
      device: 'desktop',
    },
    now,
  );
  await processDueScans(bindings, 20, now);
  expect(
    await env.DB.prepare('SELECT count(*) AS n FROM scan_runs WHERE project_id=?')
      .bind(owner.projectId)
      .first('n'),
  ).toBe(0);
});

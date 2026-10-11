import { Hono } from 'hono';
import { afterEach, expect, it, vi } from 'vitest';
import { runScheduledScans } from '../../src/server/cron';
import { cookie, seed, withBindings } from './fixtures';
import { v2Routes } from '../../src/server/v2/routes';
import { createDailyGeoRuns, saveGeoSettings, startGeoRun } from '../../src/server/v2/geo-store';
import { deleteAccountData } from '../../src/server/account-deletion';
import type { GeoRunHistory } from '../../src/shared/geo';

const owners: { env: CloudflareBindings; userId: string }[] = [];
const at = new Date('2026-10-11T12:00:00Z');
const app = new Hono<{ Bindings: CloudflareBindings }>().route('/api/v2', v2Routes);
async function setup() {
  const env = withBindings({
    GEO_SCANS_ENABLED: 'true',
    EXTERNAL_INTEGRATIONS_ENABLED: 'true',
    V2_SCANS_ENABLED: 'true',
    GEO_GLOBAL_DAILY_CALL_CAP: '150',
    GEO_PROJECT_DAILY_CALL_CAP: '40',
    GEO_PROJECT_MONTHLY_CALL_CAP: '100',
  });
  const owner = await seed(1, true, at);
  owners.push({ env, userId: owner.userId });
  await saveGeoSettings(
    env,
    owner.userId,
    {
      engines: ['google_aio'],
      dailyEnabled: true,
      languageCode: 'en',
      locationCode: 2840,
      device: 'desktop',
    },
    at,
  );
  return { env, owner };
}
afterEach(async () => {
  for (const { env, userId } of owners) {
    await env.DB.prepare('DELETE FROM subscriptions WHERE user_id=?').bind(userId).run();
    await deleteAccountData(env, userId);
  }
  owners.length = 0;
});
it('discovers a zero-capture failed scheduled run without a manual POST and isolates tenants', async () => {
  const { env, owner } = await setup();
  const run = await startGeoRun(
    env,
    owner.userId,
    { requestId: crypto.randomUUID() },
    at,
    'scheduled',
  );
  await env.DB.prepare(
    "UPDATE geo_run_items SET status='failed',terminal_reason='COLLECTOR_NOT_CONFIGURED' WHERE run_id=?",
  )
    .bind(run.id)
    .run();
  await env.DB.prepare("UPDATE scan_runs SET status='failed',completed_at=? WHERE id=?")
    .bind(at.getTime(), run.id)
    .run();
  const response = await app.request(
    '/api/v2/geo/runs',
    { headers: { Cookie: await cookie(owner.userId) } },
    env,
  );
  expect(response.status).toBe(200);
  const payload = await response.json<{ data: GeoRunHistory }>();
  expect(payload.data.runs).toContainEqual(
    expect.objectContaining({
      id: run.id,
      trigger: 'scheduled',
      status: 'failed',
      successfulCount: 0,
    }),
  );
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  const other = await setup();
  const foreign = await app.request(
    '/api/v2/geo/runs',
    { headers: { Cookie: await cookie(other.owner.userId) } },
    env,
  );
  expect((await foreign.json<{ data: GeoRunHistory }>()).data.runs).toEqual([]);
  expect((await app.request('/api/v2/geo/runs', {}, env)).status).toBe(401);
});
it('retains quota-skipped daily outcomes without reservations and retries admission after reset', async () => {
  const { env, owner } = await setup();
  const blocked = { ...env, GEO_PROJECT_DAILY_CALL_CAP: '0' };
  await createDailyGeoRuns(blocked, at);
  await createDailyGeoRuns(blocked, new Date(at.getTime() + 300_000));
  const headers = { Cookie: await cookie(owner.userId) };
  const payload = await (
    await app.request('/api/v2/geo/runs', { headers }, env)
  ).json<{ data: GeoRunHistory }>();
  expect(payload.data.dailyOutcomes).toContainEqual(
    expect.objectContaining({
      date: '2026-10-11',
      status: 'skipped',
      reason: 'GEO_BUDGET_REQUIRED',
      runId: null,
    }),
  );
  expect(payload.data.runs).toEqual([]);
  expect(
    await env.DB.prepare('SELECT count(*) AS n FROM provider_call_reservations WHERE project_id=?')
      .bind(owner.projectId)
      .first('n'),
  ).toBe(0);
  await createDailyGeoRuns(env, new Date(at.getTime() + 600_000));
  const admitted = await (
    await app.request('/api/v2/geo/runs', { headers }, env)
  ).json<{ data: GeoRunHistory }>();
  expect(admitted.data.dailyOutcomes).toHaveLength(1);
  expect(admitted.data.dailyOutcomes[0]).toMatchObject({
    status: 'admitted',
    reason: null,
    runId: admitted.data.runs[0]?.id,
  });
  expect(
    await env.DB.prepare('SELECT count(*) AS n FROM provider_call_reservations WHERE project_id=?')
      .bind(owner.projectId)
      .first('n'),
  ).toBe(1);
  await env.DB.prepare('DELETE FROM subscriptions WHERE user_id=?').bind(owner.userId).run();
  await deleteAccountData(env, owner.userId);
  expect(
    await env.DB.prepare('SELECT count(*) AS n FROM geo_daily_outcomes WHERE project_id=?')
      .bind(owner.projectId)
      .first('n'),
  ).toBe(0);
});
it('records a fully quota-blocked UTC day and keeps it when the next day is admitted', async () => {
  const { env, owner } = await setup();
  const reserved = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO provider_call_reservations(id,idempotency_key,user_id,project_id,provider,usage_date,status,reserved_at) VALUES(?,?,?,?,?,'2026-10-11','succeeded',?)",
  )
    .bind(reserved, reserved, owner.userId, owner.projectId, 'perplexity', at.getTime())
    .run();
  const capped = { ...env, GEO_PROJECT_DAILY_CALL_CAP: '1' };
  await createDailyGeoRuns(capped, at);
  await createDailyGeoRuns(capped, new Date(at.getTime() + 300_000));
  const headers = { Cookie: await cookie(owner.userId) };
  const blocked = await (
    await app.request('/api/v2/geo/runs', { headers }, env)
  ).json<{ data: GeoRunHistory }>();
  expect(blocked.data.runs).toEqual([]);
  expect(blocked.data.dailyOutcomes).toHaveLength(1);
  expect(blocked.data.dailyOutcomes[0]).toMatchObject({
    date: '2026-10-11',
    status: 'skipped',
    reason: 'GEO_QUOTA_EXCEEDED',
    runId: null,
  });
  expect(
    await env.DB.prepare('SELECT count(*) AS n FROM provider_call_reservations WHERE project_id=?')
      .bind(owner.projectId)
      .first('n'),
  ).toBe(1);
  await createDailyGeoRuns(capped, new Date('2026-10-12T00:01:00Z'));
  const next = await (
    await app.request('/api/v2/geo/runs', { headers }, env)
  ).json<{ data: GeoRunHistory }>();
  expect(next.data.dailyOutcomes).toHaveLength(2);
  expect(next.data.dailyOutcomes[0]).toMatchObject({ date: '2026-10-12', status: 'admitted' });
  expect(next.data.dailyOutcomes[1]).toMatchObject({
    date: '2026-10-11',
    status: 'skipped',
    reason: 'GEO_QUOTA_EXCEEDED',
  });
});
it('stops legacy paid cron at a shared cap occupied by GEO when GEO is enabled', async () => {
  const date = new Date('2027-02-01T12:00:00Z');
  const env = withBindings({
    GEO_SCANS_ENABLED: 'true',
    GEO_GLOBAL_DAILY_CALL_CAP: '1',
    GLOBAL_DAILY_PROVIDER_CALL_CAP: '100',
  });
  const geo = await seed(1, true, date),
    legacy = await seed(1, true, date);
  owners.push({ env, userId: geo.userId }, { env, userId: legacy.userId });
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO provider_call_reservations(id,idempotency_key,user_id,project_id,provider,usage_date,status,reserved_at) VALUES(?,?,?,?,?,'2027-02-01','reserved',?)",
  )
    .bind(id, id, geo.userId, geo.projectId, 'google_aio', date.getTime())
    .run();
  const runObservation = vi.fn();
  await runScheduledScans(env, date.getTime(), { runObservation });
  expect(runObservation).not.toHaveBeenCalled();
  expect(
    await env.DB.prepare('SELECT count(*) AS n FROM provider_call_reservations WHERE project_id=?')
      .bind(legacy.projectId)
      .first('n'),
  ).toBe(0);
});

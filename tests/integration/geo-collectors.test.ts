import { afterEach, describe, expect, it, vi } from 'vitest';
import { seed, withBindings } from './fixtures';
import { readGeoRun, saveGeoSettings, startGeoRun } from '../../src/server/v2/geo-store';
import { processGeoCollectors, reconcileGeoSubmission } from '../../src/server/v2/collectors';
import { deleteAccountData } from '../../src/server/account-deletion';

const at = new Date('2026-10-11T23:59:00Z');
const settings = {
  engines: ['google_aio'] as const,
  dailyEnabled: false,
  languageCode: 'en',
  locationCode: 2840,
  device: 'desktop' as const,
};
const bindings = () =>
  withBindings({
    GEO_SCANS_ENABLED: 'true',
    EXTERNAL_INTEGRATIONS_ENABLED: 'true',
    V2_SCANS_ENABLED: 'true',
    GEO_GLOBAL_DAILY_CALL_CAP: '100',
    GEO_PROJECT_DAILY_CALL_CAP: '40',
    GEO_PROJECT_MONTHLY_CALL_CAP: '100',
    DATAFORSEO_LOGIN: 'fixture',
    DATAFORSEO_PASSWORD: 'fixture',
  });
const reply = (status: number, result: unknown = null) =>
  Response.json({
    status_code: 20000,
    cost: status === 20100 ? 0.01 : 0,
    tasks: [{ id: 'saved-task', status_code: status, cost: status === 20100 ? 0.01 : 0, result }],
  });
async function accepted() {
  const env = bindings(),
    owner = await seed(1, true, at);
  await saveGeoSettings(env, owner.userId, { ...settings, engines: [...settings.engines] }, at);
  const run = await startGeoRun(env, owner.userId, { requestId: crypto.randomUUID() }, at);
  return { env, owner, run };
}
afterEach(() => vi.restoreAllMocks());
describe('durable GEO collectors', () => {
  it('saves one POST identity and polls across restart, midnight and paused submissions without charging twice', async () => {
    const { env, owner, run } = await accepted();
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply(20100))
      .mockResolvedValueOnce(reply(40602))
      .mockResolvedValueOnce(
        reply(20000, [
          { items: [{ type: 'ai_overview', markdown: 'OrbitCal helps teams.', references: [] }] },
        ]),
      );
    await Promise.all([processGeoCollectors(env, 1, at), processGeoCollectors(env, 1, at)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await readGeoRun(env, owner.userId, run.id)).items[0]?.providerTaskId).toBe(
      'saved-task',
    );
    const paused = { ...env, GEO_SCANS_ENABLED: 'false' };
    await processGeoCollectors(paused, 1, new Date(at.getTime() + 301_000));
    await processGeoCollectors(paused, 1, new Date(at.getTime() + 900_000));
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(['POST', 'GET', 'GET']);
    expect((await readGeoRun(env, owner.userId, run.id)).status).toBe('completed');
    expect(
      await env.DB.prepare('SELECT count(*) FROM geo_observations WHERE run_id=?')
        .bind(run.id)
        .first('count(*)'),
    ).toBe(1);
    expect(
      await env.DB.prepare(
        'SELECT reported_cost FROM provider_call_reservations WHERE scan_run_id=?',
      )
        .bind(run.id)
        .first('reported_cost'),
    ).toBe('0.01');
  });
  it('keeps acceptance uncertainty and never automatically repeats a POST', async () => {
    const { env, owner, run } = await accepted();
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('transport lost'));
    await processGeoCollectors(env, 1, at);
    await processGeoCollectors(env, 1, new Date(at.getTime() + 600_000));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await readGeoRun(env, owner.userId, run.id)).items[0]?.status).toBe(
      'submission_uncertain',
    );
    expect(
      await env.DB.prepare('SELECT count(*) FROM geo_observations WHERE run_id=?')
        .bind(run.id)
        .first('count(*)'),
    ).toBe(0);
  });
  it('cannot write private data after account deletion while a POST is in flight', async () => {
    const { env, owner } = await accepted();
    let deletionError: unknown;
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      try {
        await env.DB.prepare('DELETE FROM subscriptions WHERE user_id=?').bind(owner.userId).run();
        await deleteAccountData(env, owner.userId);
      } catch (error) {
        deletionError = error;
        throw error;
      }
      return reply(20100);
    });
    await processGeoCollectors(env, 1, at);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(deletionError).toBeUndefined();
    expect(
      await env.DB.prepare('SELECT count(*) FROM geo_run_items WHERE project_id=?')
        .bind(owner.projectId)
        .first('count(*)'),
    ).toBe(0);
    expect(
      await env.DB.prepare(
        'SELECT provider_response_json FROM provider_call_reservations WHERE user_id IS NULL ORDER BY reserved_at DESC LIMIT 1',
      ).first('provider_response_json'),
    ).toBeNull();
  });
  it('a saved task timeout only retries GET; empty AIO stays no_feature', async () => {
    const { env, owner, run } = await accepted();
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply(20100))
      .mockRejectedValueOnce(new TypeError('GET lost'))
      .mockResolvedValueOnce(reply(20000, [{ items: [] }]));
    await processGeoCollectors(env, 1, at);
    await processGeoCollectors(env, 1, new Date(at.getTime() + 301_000));
    await processGeoCollectors(env, 1, new Date(at.getTime() + 900_000));
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(['POST', 'GET', 'GET']);
    expect((await readGeoRun(env, owner.userId, run.id)).items[0]?.status).toBe('succeeded');
    expect(
      await env.DB.prepare(
        "SELECT json_extract(capture_json,'$.quality') AS quality FROM geo_observations WHERE run_id=?",
      )
        .bind(run.id)
        .first('quality'),
    ).toBe('no_feature');
  });
  it('rejects a stale worker capture and allows explicit operator close without another POST', async () => {
    const { env, owner, run } = await accepted();
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      await env.DB.prepare(
        "UPDATE geo_run_items SET lease_token='newer-worker',lease_until=? WHERE run_id=?",
      )
        .bind(at.getTime() + 300_000, run.id)
        .run();
      return reply(20100);
    });
    await processGeoCollectors(env, 1, at);
    await processGeoCollectors(env, 1, new Date(at.getTime() + 600_000));
    expect(fetcher).toHaveBeenCalledTimes(1);
    const uncertain = await readGeoRun(env, owner.userId, run.id);
    expect(uncertain.items[0]?.status).toBe('submission_uncertain');
    await reconcileGeoSubmission(env, run.items[0]?.id ?? '', null);
    expect((await readGeoRun(env, owner.userId, run.id)).items[0]?.terminalReason).toBe(
      'operator_closed_without_retry',
    );
    expect(
      await env.DB.prepare('SELECT count(*) FROM geo_observations WHERE run_id=?')
        .bind(run.id)
        .first('count(*)'),
    ).toBe(0);
  });
  it('verifies the saved task tag before operator recovery', async () => {
    const { env, owner, run } = await accepted();
    const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('lost'));
    await processGeoCollectors(env, 1, at);
    fetcher.mockResolvedValueOnce(
      Response.json({
        status_code: 20000,
        tasks: [{ id: 'recovered', status_code: 40602, data: { tag: 'another-item' } }],
      }),
    );
    await expect(reconcileGeoSubmission(env, run.items[0]?.id ?? '', 'recovered')).rejects.toThrow(
      'TASK_CORRELATION_MISMATCH',
    );
    fetcher.mockResolvedValueOnce(
      Response.json({
        status_code: 20000,
        tasks: [{ id: 'recovered', status_code: 40602, data: { tag: run.items[0]?.id } }],
      }),
    );
    await reconcileGeoSubmission(env, run.items[0]?.id ?? '', 'recovered');
    expect((await readGeoRun(env, owner.userId, run.id)).items[0]?.providerTaskId).toBe(
      'recovered',
    );
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(['POST', 'GET', 'GET']);
  });
});

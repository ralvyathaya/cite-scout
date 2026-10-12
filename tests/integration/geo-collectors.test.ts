import { afterEach, describe, expect, it, vi } from 'vitest';
import { seed, withBindings } from './fixtures';
import { readGeoRun, saveGeoSettings, startGeoRun } from '../../src/server/v2/geo-store';
import { processGeoCollectors, reconcileGeoSubmission } from '../../src/server/v2/collectors';
import { deleteAccountData } from '../../src/server/account-deletion';

const at = new Date('2026-10-11T23:59:00Z');
const fixtureOwners: { env: CloudflareBindings; userId: string }[] = [];
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
  fixtureOwners.push({ env, userId: owner.userId });
  await saveGeoSettings(env, owner.userId, { ...settings, engines: [...settings.engines] }, at);
  const run = await startGeoRun(env, owner.userId, { requestId: crypto.randomUUID() }, at);
  return { env, owner, run };
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const owner of fixtureOwners) {
    await owner.env.DB.prepare('DELETE FROM subscriptions WHERE user_id=?')
      .bind(owner.userId)
      .run();
    await deleteAccountData(owner.env, owner.userId);
  }
  fixtureOwners.length = 0;
});
describe('durable GEO collectors', () => {
  it('moves the same pending reservation to the POST day and keeps that date for paused GET recovery', async () => {
    const { env, owner, run } = await accepted();
    const item = run.items[0];
    if (!item) throw new Error('Expected an accepted item');
    const postedAt = new Date('2026-10-12T00:01:00Z');
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(reply(20100));
    await processGeoCollectors(env, 1, postedAt);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(
      await env.DB.prepare(
        'SELECT id,usage_date,request_context_json FROM provider_call_reservations WHERE scan_run_id=?',
      )
        .bind(run.id)
        .first(),
    ).toEqual({
      id: item.reservationId,
      usage_date: '2026-10-12',
      request_context_json: JSON.stringify(item.context),
    });
    fetcher.mockResolvedValueOnce(reply(20000, [{ items: [] }]));
    await processGeoCollectors(
      { ...env, GEO_SCANS_ENABLED: 'false' },
      1,
      new Date('2026-10-13T00:01:00Z'),
    );
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(['POST', 'GET']);
    expect((await readGeoRun(env, owner.userId, run.id)).items[0]?.reservationId).toBe(
      item.reservationId,
    );
    expect(
      await env.DB.prepare('SELECT usage_date FROM provider_call_reservations WHERE id=?')
        .bind(item.reservationId)
        .first('usage_date'),
    ).toBe('2026-10-12');
  });
  it.each(['projectDay', 'projectMonth', 'globalDay'] as const)(
    'does not POST accepted prior-day work when the actual %s budget is exhausted',
    async (cap) => {
      const { env, owner, run } = await accepted();
      const item = run.items[0];
      if (!item) throw new Error('Expected an accepted item');
      const limits = {
        ...env,
        GEO_PROJECT_DAILY_CALL_CAP: cap === 'projectDay' ? '1' : '40',
        GEO_PROJECT_MONTHLY_CALL_CAP: cap === 'projectMonth' ? '1' : '100',
        GLOBAL_DAILY_PROVIDER_CALL_CAP: cap === 'globalDay' ? '1' : '150',
      };
      const usageDate = cap === 'projectMonth' ? '2026-10-01' : '2026-10-12';
      await env.DB.prepare(
        `INSERT INTO provider_call_reservations(id,idempotency_key,project_id,provider,usage_date,status,reserved_at)
        VALUES (?, ?, ?, 'perplexity', ?, 'failed', ?)`,
      )
        .bind(
          crypto.randomUUID(),
          crypto.randomUUID(),
          cap === 'globalDay' ? null : owner.projectId,
          usageDate,
          at.getTime(),
        )
        .run();
      const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(reply(20100));
      await Promise.all([
        processGeoCollectors(limits, 1, new Date('2026-10-12T00:01:00Z')),
        processGeoCollectors(limits, 1, new Date('2026-10-12T00:01:00Z')),
      ]);
      expect(fetcher).not.toHaveBeenCalled();
      expect((await readGeoRun(env, owner.userId, run.id)).items[0]).toMatchObject({
        status: 'pending',
        terminalReason: 'GEO_QUOTA_EXCEEDED',
        providerTaskId: null,
        reservationId: item.reservationId,
        context: item.context,
      });
      expect(
        await env.DB.prepare('SELECT count(*) FROM provider_call_reservations WHERE scan_run_id=?')
          .bind(run.id)
          .first('count(*)'),
      ).toBe(1);
      expect(
        await env.DB.prepare('SELECT usage_date FROM provider_call_reservations WHERE id=?')
          .bind(item.reservationId)
          .first('usage_date'),
      ).toBe('2026-10-11');
    },
  );
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
  it('recovers the same saved GET after a capture persistence failure without another POST', async () => {
    const { env, owner, run } = await accepted();
    const capture = {
      status_code: 20000,
      cost: 0,
      tasks: [
        {
          id: 'saved-task',
          status_code: 20000,
          cost: 0,
          result: [
            { items: [{ type: 'ai_overview', markdown: 'Original paid answer.', references: [] }] },
          ],
        },
      ],
    };
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(reply(20100));
    await processGeoCollectors(env, 1, at);
    const submitted = (await readGeoRun(env, owner.userId, run.id)).items[0];
    if (!submitted) throw new Error('Expected a submitted item');
    const storage = vi.spyOn(env.DB, 'batch');
    fetcher.mockImplementationOnce(() => {
      storage.mockRejectedValueOnce(new Error('Transient D1 capture save failure'));
      return Promise.resolve(Response.json(capture));
    });
    await processGeoCollectors(env, 1, new Date(Date.parse(submitted.dueAt) + 1));
    const deferred = (await readGeoRun(env, owner.userId, run.id)).items[0];
    if (!deferred) throw new Error('Expected a deferred item');
    expect(deferred).toMatchObject({
      status: 'submitted',
      providerTaskId: 'saved-task',
      terminalReason: 'COLLECTOR_PERSISTENCE_ERROR',
    });
    expect(
      await env.DB.prepare('SELECT count(*) FROM geo_observations WHERE run_id=?')
        .bind(run.id)
        .first('count(*)'),
    ).toBe(0);
    expect(
      await env.DB.prepare(
        'SELECT status,reported_cost,provider_response_json FROM provider_call_reservations WHERE scan_run_id=?',
      )
        .bind(run.id)
        .first(),
    ).toEqual({
      status: 'reserved',
      reported_cost: '0.01',
      provider_response_json: JSON.stringify(capture),
    });
    fetcher.mockResolvedValueOnce(Response.json(capture));
    await processGeoCollectors(
      { ...env, GEO_SCANS_ENABLED: 'false' },
      1,
      new Date(Date.parse(deferred.dueAt) + 1),
    );
    expect(fetcher.mock.calls.map((call) => call[1]?.method)).toEqual(['POST', 'GET', 'GET']);
    expect(fetcher.mock.calls.slice(1).map((call) => call[0])).toEqual([
      'https://api.dataforseo.com/v3/serp/google/organic/task_get/advanced/saved-task',
      'https://api.dataforseo.com/v3/serp/google/organic/task_get/advanced/saved-task',
    ]);
    expect((await readGeoRun(env, owner.userId, run.id)).items[0]?.status).toBe('succeeded');
    const saved = await env.DB.prepare(
      "SELECT answer_text,json_extract(capture_json,'$.raw') AS raw FROM geo_observations WHERE run_id=?",
    )
      .bind(run.id)
      .all();
    expect(saved.results).toEqual([
      { answer_text: 'Original paid answer.', raw: JSON.stringify(capture) },
    ]);
  });
  it('keeps accepted POST identity persistence failures uncertain without another paid POST', async () => {
    const { env, owner, run } = await accepted();
    const storage = vi.spyOn(env.DB, 'batch');
    const acceptedReply = {
      status_code: 20000,
      cost: 0.01,
      tasks: [{ id: 'saved-task', status_code: 20100, cost: 0.01, result: null }],
    };
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => {
      storage.mockRejectedValueOnce(new Error('Transient D1 task identity save failure'));
      return Promise.resolve(Response.json(acceptedReply));
    });
    await processGeoCollectors(env, 1, at);
    await processGeoCollectors(env, 1, new Date(at.getTime() + 600_000));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await readGeoRun(env, owner.userId, run.id)).items[0]).toMatchObject({
      status: 'submission_uncertain',
      terminalReason: 'COLLECTOR_PERSISTENCE_ERROR',
    });
    expect(
      await env.DB.prepare(
        'SELECT status,reported_cost,provider_response_json FROM provider_call_reservations WHERE scan_run_id=?',
      )
        .bind(run.id)
        .first(),
    ).toEqual({
      status: 'reserved',
      reported_cost: '0.01',
      provider_response_json: JSON.stringify(acceptedReply),
    });
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

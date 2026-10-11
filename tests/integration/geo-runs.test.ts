import { describe, expect, it, vi } from 'vitest';
import { seed, withBindings } from './fixtures';
import {
  readGeoRun,
  readGeoSettings,
  saveGeoSettings,
  startGeoRun,
  reconcileGeoItems,
  claimGeoItem,
  geoAllowance,
  readGeoObservations,
  readGeoObservation,
} from '../../src/server/v2/geo-store';

const bindings = () =>
  withBindings({
    GEO_SCANS_ENABLED: 'true',
    EXTERNAL_INTEGRATIONS_ENABLED: 'true',
    V2_SCANS_ENABLED: 'true',
    GEO_GLOBAL_DAILY_CALL_CAP: '150',
    GEO_PROJECT_DAILY_CALL_CAP: '40',
    GEO_PROJECT_MONTHLY_CALL_CAP: '100',
  });
const settings = {
  engines: ['perplexity', 'google_aio'] as ('perplexity' | 'google_aio')[],
  dailyEnabled: true,
  languageCode: 'en',
  locationCode: 2840,
  device: 'desktop' as const,
};
const at = new Date('2026-10-11T12:00:00Z');

describe('GEO accepted work and ownership', () => {
  it('claims a same-day reservation at exact daily and monthly limits without counting it twice', async () => {
    const env = {
      ...bindings(),
      GLOBAL_DAILY_PROVIDER_CALL_CAP: '1',
      GEO_PROJECT_DAILY_CALL_CAP: '1',
      GEO_PROJECT_MONTHLY_CALL_CAP: '1',
    };
    const owner = await seed(1, true, at);
    await saveGeoSettings(env, owner.userId, { ...settings, engines: ['google_aio'] }, at);
    const run = await startGeoRun(env, owner.userId, { requestId: crypto.randomUUID() }, at);
    const item = run.items[0];
    if (!item) throw new Error('Expected an accepted item');
    expect(await claimGeoItem(env, item.id, at)).toMatchObject({ status: 'submitting' });
    expect(await claimGeoItem(env, item.id, at)).toBeNull();
  });
  it('atomically rebases prior-month pending claims within the shared global cap without counting themselves twice', async () => {
    const acceptedAt = new Date('2026-09-30T23:59:00Z');
    const postedAt = new Date('2026-10-01T00:01:00Z');
    const env = bindings();
    const owners = await Promise.all([seed(1, true, acceptedAt), seed(1, true, acceptedAt)]);
    const runs = [];
    for (const owner of owners) {
      await saveGeoSettings(
        env,
        owner.userId,
        { ...settings, engines: ['google_aio'] },
        acceptedAt,
      );
      runs.push(
        await startGeoRun(env, owner.userId, { requestId: crypto.randomUUID() }, acceptedAt),
      );
    }
    const items = runs.map((run) => {
      const item = run.items[0];
      if (!item) throw new Error('Fixture requires one pending item');
      return item;
    });
    if (!items[0] || !items[1]) throw new Error('Expected two accepted items');
    const limited = {
      ...env,
      GLOBAL_DAILY_PROVIDER_CALL_CAP: '1',
      GEO_PROJECT_DAILY_CALL_CAP: '1',
      GEO_PROJECT_MONTHLY_CALL_CAP: '1',
    };
    const claimed = await Promise.all(
      items.map((item) => claimGeoItem(limited, item.id, postedAt)),
    );
    expect(claimed.filter(Boolean)).toHaveLength(1);
    expect(
      await env.DB.prepare(
        "SELECT count(*) FROM provider_call_reservations WHERE usage_date='2026-10-01'",
      ).first('count(*)'),
    ).toBe(1);
    expect(
      await env.DB.prepare(
        'SELECT count(*) FROM provider_call_reservations WHERE scan_run_id IN (?,?)',
      )
        .bind(...runs.map((run) => run.id))
        .first('count(*)'),
    ).toBe(2);
  });
  it('replays the same payload without new reservations and rejects UUID reuse with changed scope', async () => {
    const env = bindings(),
      owner = await seed(1, true, at);
    await saveGeoSettings(env, owner.userId, settings, at);
    const requestId = crypto.randomUUID();
    const first = await startGeoRun(env, owner.userId, { requestId }, at);
    const replay = await startGeoRun(
      env,
      owner.userId,
      { requestId },
      new Date(at.getTime() + 1000),
    );
    expect(replay.id).toBe(first.id);
    expect(first.items).toHaveLength(2);
    expect(new Set(first.items.map((item) => item.engine)).size).toBe(2);
    expect(
      await env.DB.prepare(
        'SELECT count(*) AS count FROM provider_call_reservations WHERE project_id=?',
      )
        .bind(owner.projectId)
        .first('count'),
    ).toBe(2);
    await expect(
      startGeoRun(env, owner.userId, { requestId, engines: ['perplexity'] }, at),
    ).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    // Replaying accepted work remains possible while new submissions are paused.
    expect(
      (
        await startGeoRun(
          withBindings({ GEO_SCANS_ENABLED: 'false' }),
          owner.userId,
          { requestId },
          at,
        )
      ).id,
    ).toBe(first.id);
  });

  it('atomically excludes concurrent different keys for the same scope', async () => {
    const env = bindings(),
      owner = await seed(1, true, at);
    await saveGeoSettings(env, owner.userId, settings, at);
    const attempts = await Promise.allSettled([
      startGeoRun(env, owner.userId, { requestId: crypto.randomUUID() }, at),
      startGeoRun(env, owner.userId, { requestId: crypto.randomUUID() }, at),
    ]);
    expect(attempts.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(
      await env.DB.prepare(
        'SELECT count(*) AS count FROM provider_call_reservations WHERE project_id=?',
      )
        .bind(owner.projectId)
        .first('count'),
    ).toBe(2);
  });

  it('starts a fresh manual run after a completed daily run without replacing frozen context', async () => {
    const env = bindings(),
      owner = await seed(1, true, at);
    await saveGeoSettings(env, owner.userId, settings, at);
    const daily = await startGeoRun(
      env,
      owner.userId,
      { requestId: crypto.randomUUID() },
      at,
      'scheduled',
    );
    await env.DB.prepare("UPDATE geo_run_items SET status='succeeded' WHERE run_id=?")
      .bind(daily.id)
      .run();
    const manual = await startGeoRun(
      env,
      owner.userId,
      { requestId: crypto.randomUUID() },
      new Date(at.getTime() + 300_001),
    );
    expect(manual.id).not.toBe(daily.id);
    expect(manual.items[0]?.context.promptText).toBe('Best scheduling tool number 0');
    expect(manual.items[0]?.context.brand.name).toBe('OrbitCal');
    expect(manual.items[0]?.context.promptText).not.toContain('OrbitCal');
    expect(manual.items[0]?.context.promptVersionId).toBe(daily.items[0]?.context.promptVersionId);
  });

  it('enforces project budget using the same sticky ledger as existing calls', async () => {
    const env = bindings(),
      owner = await seed(1, true, at);
    await saveGeoSettings(env, owner.userId, settings, at);
    await expect(
      startGeoRun(
        withBindings({
          GEO_SCANS_ENABLED: 'true',
          EXTERNAL_INTEGRATIONS_ENABLED: 'true',
          GEO_GLOBAL_DAILY_CALL_CAP: '150',
          GEO_PROJECT_DAILY_CALL_CAP: '1',
          GEO_PROJECT_MONTHLY_CALL_CAP: '100',
        }),
        owner.userId,
        { requestId: crypto.randomUUID() },
        at,
      ),
    ).rejects.toThrow('GEO_QUOTA_EXCEEDED');
    expect(
      await env.DB.prepare(
        'SELECT count(*) AS count FROM provider_call_reservations WHERE project_id=?',
      )
        .bind(owner.projectId)
        .first('count'),
    ).toBe(0);
  });

  it('accepts ten prompts across four engines within D1 query and bound-parameter limits', async () => {
    const env = bindings(),
      owner = await seed(10, true, at);
    await saveGeoSettings(
      env,
      owner.userId,
      { ...settings, engines: ['perplexity', 'google_aio', 'chatgpt_search', 'bing_copilot'] },
      at,
    );
    const prepared = vi.spyOn(env.DB, 'prepare');
    let queries: number;
    let run;
    try {
      run = await startGeoRun(env, owner.userId, { requestId: crypto.randomUUID() }, at);
      queries = prepared.mock.calls.length;
    } finally {
      prepared.mockRestore();
    }
    expect(run.items).toHaveLength(40);
    expect(queries).toBeLessThanOrEqual(50);
    expect((await geoAllowance(env, owner.userId, at)).today).toBe(40);
  });

  it('keeps the frozen trial paid-start date and does not expose executor leases', async () => {
    const env = bindings(),
      owner = await seed(1, true, at);
    await saveGeoSettings(env, owner.userId, settings, at);
    await env.DB.prepare(
      `INSERT INTO pilot_enrollments
      (user_id,qualified_at,manual_check_at,role,authority_confirmed,example_verified,paid_starts_at)
      VALUES (?,?,?,'founder',1,1,?)`,
    )
      .bind(owner.userId, at.getTime(), at.getTime(), at.getTime() + 1000)
      .run();
    await expect(
      startGeoRun(env, owner.userId, { requestId: crypto.randomUUID() }, at),
    ).rejects.toThrow('PAID_STARTS_NEXT_UTC_DAY');
    const run = await startGeoRun(
      env,
      owner.userId,
      { requestId: crypto.randomUUID() },
      new Date(at.getTime() + 1000),
    );
    const item = run.items[0];
    if (!item) throw new Error('Expected an accepted item');
    expect(await claimGeoItem(env, item.id, new Date(at.getTime() + 1000))).toMatchObject({
      status: 'submitting',
    });
    expect((await readGeoRun(env, owner.userId, run.id)).items[0]).not.toHaveProperty('leaseToken');
  });

  it('allows saved task recovery while new submissions are paused', async () => {
    const env = bindings(),
      owner = await seed(1, true, at);
    await saveGeoSettings(env, owner.userId, settings, at);
    const run = await startGeoRun(env, owner.userId, { requestId: crypto.randomUUID() }, at);
    const saved = run.items[0],
      pending = run.items[1];
    if (!saved || !pending) throw new Error('Expected two accepted items');
    await env.DB.prepare(
      "UPDATE geo_run_items SET status='submitted',provider_task_id='saved-id' WHERE id=?",
    )
      .bind(saved.id)
      .run();
    const paused = withBindings({
      GEO_SCANS_ENABLED: 'false',
      EXTERNAL_INTEGRATIONS_ENABLED: 'false',
    });
    expect(await claimGeoItem(paused, pending.id, at)).toBeNull();
    expect(await claimGeoItem(paused, saved.id, at)).toMatchObject({
      provider_task_id: 'saved-id',
      status: 'submitted',
    });
  });

  it('stores immutable capture evidence and lists bounded summaries without raw envelopes', async () => {
    const env = bindings(),
      owner = await seed(1, true, at);
    await saveGeoSettings(env, owner.userId, settings, at);
    const run = await startGeoRun(env, owner.userId, { requestId: crypto.randomUUID() }, at),
      item = run.items[0];
    if (!item) throw new Error('Expected an accepted item');
    const capture = {
      schemaVersion: 'geo-capture-1',
      answerText: 'Original answer',
      raw: { original: true },
      textParts: [{ itemIndex: 0, contentIndex: 0, text: 'Original answer' }],
      model: null,
      modelReported: false,
      sources: [],
      quality: 'complete',
      providerRequestId: 'task',
      providerStatus: '20000',
      reportedCost: null,
      inputTokens: null,
      outputTokens: null,
    };
    await env.DB.prepare(
      `INSERT INTO geo_observations(id,project_id,run_id,item_id,prompt_version_id,engine,status,context_json,capture_json,answer_text,captured_at)
      VALUES (?,?,?,?,?,?,'complete',?,?,?,?)`,
    )
      .bind(
        'geo-evidence',
        owner.projectId,
        run.id,
        item.id,
        item.context.promptVersionId,
        item.engine,
        JSON.stringify(item.context),
        JSON.stringify(capture),
        capture.answerText,
        at.getTime(),
      )
      .run();
    const page = await readGeoObservations(env, owner.userId);
    expect(page.observations[0]?.capture.raw).toBeNull();
    expect(page.observations[0]?.capture.answerText).toBe('Original answer');
    expect((await readGeoObservation(env, owner.userId, 'geo-evidence')).capture.raw).toEqual({
      original: true,
    });
    await expect(
      env.DB.prepare(
        "UPDATE geo_observations SET answer_text='rewritten' WHERE id='geo-evidence'",
      ).run(),
    ).rejects.toThrow();
  });

  it('cancels only unsubmitted items after configuration changes and retains submitted work', async () => {
    const env = bindings(),
      owner = await seed(1, true, at);
    await saveGeoSettings(env, owner.userId, settings, at);
    const run = await startGeoRun(env, owner.userId, { requestId: crypto.randomUUID() }, at);
    const submitted = run.items[0];
    await env.DB.prepare(
      "UPDATE geo_run_items SET status='submitted',provider_task_id='saved-task',submitted_at=? WHERE id=?",
    )
      .bind(at.getTime(), submitted?.id)
      .run();
    await saveGeoSettings(
      env,
      owner.userId,
      { ...settings, engines: ['google_aio'] },
      new Date(at.getTime() + 1000),
    );
    await reconcileGeoItems(env, new Date(at.getTime() + 2000));
    const saved = await readGeoRun(env, owner.userId, run.id);
    expect(saved.items.find((item) => item.id === submitted?.id)?.status).toBe('submitted');
    expect(saved.items.find((item) => item.id !== submitted?.id)?.terminalReason).toBe(
      'configuration_changed',
    );
    expect(saved.items.find((item) => item.id === submitted?.id)?.context.settingsRevision).toBe(1);
  });

  it('isolates tenant reads and cascades private GEO state while retaining money reservations', async () => {
    const env = bindings(),
      owner = await seed(1, true, at),
      other = await seed(1, true, at);
    await saveGeoSettings(env, owner.userId, settings, at);
    const run = await startGeoRun(env, owner.userId, { requestId: crypto.randomUUID() }, at);
    await expect(readGeoRun(env, other.userId, run.id)).rejects.toThrow('GEO_RUN_NOT_FOUND');
    await expect(readGeoSettings(env, 'missing-user')).rejects.toThrow('PROJECT_NOT_FOUND');
    await env.DB.prepare('DELETE FROM subscriptions WHERE user_id=?').bind(owner.userId).run();
    await env.DB.prepare('DELETE FROM users WHERE id=?').bind(owner.userId).run();
    expect(
      await env.DB.prepare('SELECT count(*) AS count FROM geo_run_items WHERE run_id=?')
        .bind(run.id)
        .first('count'),
    ).toBe(0);
    expect(
      await env.DB.prepare(
        'SELECT count(*) AS count FROM provider_call_reservations WHERE scan_run_id IS NULL AND user_id IS NULL AND provider IN (?,?)',
      )
        .bind('perplexity', 'google_aio')
        .first('count'),
    ).toBe(2);
    await expect(readGeoRun(env, owner.userId, run.id)).rejects.toThrow('GEO_RUN_NOT_FOUND');
  });
});

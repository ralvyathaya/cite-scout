import { expect, it, vi } from 'vitest';
import { seed, withBindings } from './fixtures';
import { seedGeoEvidence } from './geo-fixtures';
import { syncGeoActions, readGeoActions, readGeoAction } from '../../src/server/v2/actions';
import {
  completeGeoAction,
  reopenGeoAction,
  readGeoMeasurements,
  readGeoTrends,
} from '../../src/server/v2/measurement';
import { saveGeoSettings } from '../../src/server/v2/geo-store';
const bindings = () =>
  withBindings({
    GEO_SCANS_ENABLED: 'true',
    EXTERNAL_INTEGRATIONS_ENABLED: 'true',
    V2_SCANS_ENABLED: 'true',
    GEO_GLOBAL_DAILY_CALL_CAP: '150',
    GEO_PROJECT_DAILY_CALL_CAP: '40',
    GEO_PROJECT_MONTHLY_CALL_CAP: '100',
  });
it('records idempotent completion with separate implementation time; reopen and another cycle preserve both pins without reserving calls', async () => {
  const env = bindings(),
    at = new Date(),
    owner = await seed(1, true, at),
    other = await seed(1, true, at);
  await seedGeoEvidence(env, owner, 'perplexity', at);
  await syncGeoActions(env, owner.userId, at);
  const [action] = await readGeoActions(env, owner.userId);
  if (!action) throw new Error('fixture action');
  const before = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM provider_call_reservations',
  ).first<{ n: number }>();
  const body = {
    requestId: crypto.randomUUID(),
    revision: action.revision,
    implementedAt: new Date(at.getTime() - 1000).toISOString(),
    changeDescription: 'Published the verified product comparison.',
    changeUrl: 'https://orbitcal.test/comparison',
  };
  const completed = await completeGeoAction(env, owner.userId, action.id, body, at);
  expect(completed.status).toBe('completed');
  expect((await completeGeoAction(env, owner.userId, action.id, body, at)).revision).toBe(
    completed.revision,
  );
  await expect(completeGeoAction(env, other.userId, action.id, body, at)).rejects.toThrow(
    'GEO_ACTION_NOT_FOUND',
  );
  const reopened = await reopenGeoAction(
    env,
    owner.userId,
    action.id,
    {
      requestId: crypto.randomUUID(),
      revision: completed.revision,
      reason: 'Add better verified evidence.',
    },
    at,
  );
  await completeGeoAction(
    env,
    owner.userId,
    action.id,
    { ...body, requestId: crypto.randomUUID(), revision: reopened.revision },
    at,
  );
  const pins = await readGeoMeasurements(env, owner.userId, action.id, at);
  expect(pins).toHaveLength(2);
  expect(pins[0]).toMatchObject({
    recordedAt: at.toISOString(),
    implementedAt: body.implementedAt,
    version: 'geo-measurement-1',
  });
  expect(pins[0]?.metrics.every((metric) => metric.outcome === 'inconclusive')).toBe(true);
  expect(
    (await readGeoAction(env, owner.userId, action.id)).events.filter(
      (event) => event.kind === 'reopened',
    ),
  ).toHaveLength(1);
  expect(
    (
      await env.DB.prepare('SELECT COUNT(*) AS n FROM provider_call_reservations').first<{
        n: number;
      }>()
    )?.n,
  ).toBe(before?.n);
  await expect(
    completeGeoAction(
      env,
      owner.userId,
      action.id,
      {
        ...body,
        requestId: crypto.randomUUID(),
        revision: 3,
        implementedAt: new Date(at.getTime() + 1000).toISOString(),
      },
      at,
    ),
  ).rejects.toThrow('INVALID_IMPLEMENTATION_TIME');
});
it('freezes daily trend evidence, exposes sample counts, and prevents another tenant from reading pins', async () => {
  const env = bindings(),
    at = new Date('2026-10-11T10:00:00Z'),
    owner = await seed(1, true, at),
    other = await seed(1, true, at);
  const first = await seedGeoEvidence(env, owner, 'perplexity', at);
  const trend = await readGeoTrends(env, owner.userId, {}, at);
  expect(trend.samples.find((sample) => sample.metric === 'mention')?.observationId).toBe(
    first.observation.id,
  );
  const prepared = vi.spyOn(env.DB, 'prepare');
  try {
    await readGeoTrends(env, owner.userId, {}, at);
    expect(
      prepared.mock.calls.filter(([query]) =>
        query.includes('INSERT OR IGNORE INTO geo_measurement_samples'),
      ),
    ).toHaveLength(0);
  } finally {
    prepared.mockRestore();
  }
  await seedGeoEvidence(
    env,
    owner,
    'perplexity',
    new Date(at.getTime() + 301_000),
    'OrbitCal is recommended.',
    {
      presence: 'present',
      stance: 'recommended',
    },
  );
  const later = await readGeoTrends(env, owner.userId, {}, new Date(at.getTime() + 301_000));
  expect(later.samples.find((sample) => sample.metric === 'mention')?.observationId).toBe(
    first.observation.id,
  );
  await syncGeoActions(env, owner.userId, at);
  const [action] = await readGeoActions(env, owner.userId);
  if (!action) throw new Error('fixture action');
  await expect(readGeoMeasurements(env, other.userId, action.id)).rejects.toThrow(
    'GEO_ACTION_NOT_FOUND',
  );
});
it('admits late classification without replacing a frozen day or writing it again through a narrower window', async () => {
  const env = bindings(),
    at = new Date('2026-10-11T09:00:00Z'),
    laterAt = new Date(at.getTime() + 301_000),
    owner = await seed(1, true, at);
  const earlier = await seedGeoEvidence(env, owner, 'perplexity', at, 'OrbitCal is recommended.', {
    presence: 'present',
    stance: 'recommended',
  });
  await env.DB.prepare("UPDATE geo_processing_attempts SET state='queued' WHERE id=?")
    .bind(earlier.analysisId)
    .run();
  const first = await seedGeoEvidence(env, owner, 'perplexity', laterAt);
  expect(
    (await readGeoTrends(env, owner.userId, {}, laterAt)).samples.find(
      (s) => s.metric === 'mention',
    ),
  ).toMatchObject({ observationId: first.observation.id, value: 0 });
  await env.DB.prepare("UPDATE geo_processing_attempts SET state='completed' WHERE id=?")
    .bind(earlier.analysisId)
    .run();
  const prepared = vi.spyOn(env.DB, 'prepare');
  try {
    const unchanged = await readGeoTrends(env, owner.userId, {}, laterAt);
    expect(unchanged.samples.find((s) => s.metric === 'mention')).toMatchObject({
      observationId: first.observation.id,
      value: 0,
    });
    const narrower = await readGeoTrends(
      env,
      owner.userId,
      { days: 1 },
      new Date(laterAt.getTime() + 86400_000 - 1000),
    );
    expect(narrower.samples.find((s) => s.metric === 'mention')?.observationId).toBe(
      first.observation.id,
    );
    expect((await readGeoTrends(env, owner.userId, {}, at)).samples).toEqual([]);
    expect(
      prepared.mock.calls.filter(([query]) =>
        query.includes('INSERT OR IGNORE INTO geo_measurement_samples'),
      ),
    ).toHaveLength(0);
  } finally {
    prepared.mockRestore();
  }
  await env.DB.prepare("UPDATE geo_processing_attempts SET model='clef' WHERE id=?")
    .bind(earlier.analysisId)
    .run();
  const changed = await readGeoTrends(env, owner.userId, {}, laterAt);
  expect(changed.samples.filter((s) => s.metric === 'mention')).toHaveLength(2);
  expect(
    changed.samples.find(
      (s) => s.observationId === earlier.observation.id && s.metric === 'mention',
    )?.value,
  ).toBe(1);
});
it('compares frozen matching scope and makes disabled scope inconclusive instead of dropping it', async () => {
  const env = bindings(),
    now = new Date(),
    baselineAt = new Date(now.getTime() - 86400_000),
    owner = await seed(1, true, baselineAt);
  await seedGeoEvidence(env, owner, 'perplexity', baselineAt);
  await syncGeoActions(env, owner.userId, baselineAt);
  const [action] = await readGeoActions(env, owner.userId);
  if (!action) throw new Error('fixture action');
  const implementedAt = new Date(now.getTime() - 600_000).toISOString();
  await completeGeoAction(
    env,
    owner.userId,
    action.id,
    {
      requestId: crypto.randomUUID(),
      revision: action.revision,
      implementedAt,
      changeDescription: 'Updated and verified the product comparison.',
    },
    now,
  );
  await seedGeoEvidence(env, owner, 'perplexity', now, 'OrbitCal is recommended.', {
    presence: 'present',
    stance: 'recommended',
  });
  const pins = await readGeoMeasurements(env, owner.userId, action.id, now);
  expect(pins[0]?.metrics.find((metric) => metric.metric === 'mention')).toMatchObject({
    outcome: 'improved',
    before: 0,
    after: 1,
    beforeSamples: 1,
    afterSamples: 1,
    limitedData: true,
  });
  await saveGeoSettings(
    env,
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
  expect(
    (await readGeoMeasurements(env, owner.userId, action.id, now))[0]?.metrics.find(
      (metric) => metric.metric === 'mention',
    )?.outcome,
  ).toBe('inconclusive');
  const frozen = await env.DB.prepare(
    'SELECT id FROM geo_measurement_samples WHERE event_id IS NOT NULL LIMIT 1',
  ).first<{ id: string }>();
  await expect(
    env.DB.prepare("UPDATE geo_measurement_samples SET day='2099-01-01' WHERE id=?")
      .bind(frozen?.id ?? '')
      .run(),
  ).rejects.toThrow('GEO_MEASUREMENT_SAMPLE_IMMUTABLE');
});

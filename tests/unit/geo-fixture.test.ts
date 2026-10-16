import { expect, it } from 'vitest';
import { GeoFixtureWorkspace, fixtureDisposition } from '../../src/client/pages/v2/geo-fixture';
import type { GeoAction, GeoActionDetail } from '../../src/shared/geo-actions';
import type { GeoObservationPage, GeoRun } from '../../src/shared/geo';
import type { GeoPinMeasurement } from '../../src/shared/geo-measurement';
it('isolates local fixture mode and never permits a requested but unavailable fixture to become live', () => {
  expect(fixtureDisposition('localhost', true)).toEqual({ requested: true, enabled: true });
  expect(fixtureDisposition('cite-scout.com', true)).toEqual({ requested: true, enabled: false });
  expect(fixtureDisposition('localhost', false)).toEqual({ requested: false, enabled: false });
});
it('uses the prospective collector policy for fresh synthetic runs and preserves prior contexts', async () => {
  const fixture = new GeoFixtureWorkspace();
  const before = structuredClone(
    (await fixture.request('/geo/observations')) as GeoObservationPage,
  );
  const run = (await fixture.request(
    '/geo/runs',
    {
      requestId: crypto.randomUUID(),
      engines: ['perplexity', 'openai_web_search', 'google_aio', 'bing_copilot'],
    },
    'POST',
  )) as GeoRun;
  expect(
    Object.fromEntries(
      run.items.map((item) => [
        item.engine,
        [item.context.collectorVersion, item.context.maxOutputTokens],
      ]),
    ),
  ).toEqual({
    perplexity: ['geo-collector-1', 700],
    openai_web_search: ['geo-collector-3', 1600],
    google_aio: ['geo-collector-2', 700],
    bing_copilot: ['geo-collector-3', 700],
  });
  for (const saved of before.observations)
    expect(
      ((await fixture.request(`/geo/observations/${saved.id}`)) as typeof saved).context,
    ).toEqual(saved.context);
});
it('creates an explicitly scoped synthetic follow-up without changing its source history', async () => {
  const fixture = new GeoFixtureWorkspace();
  const source = ((await fixture.request('/geo/actions')) as GeoAction[]).find(
    (action) => action.category === 'owned',
  );
  if (!source) throw new Error('Expected an owned synthetic action');
  const original = structuredClone(
    (await fixture.request(`/geo/actions/${source.id}`)) as GeoActionDetail,
  );
  const proof = original.evidence[0];
  if (!proof) throw new Error('Expected a baseline proof');
  const input = {
    requestId: crypto.randomUUID(),
    revision: source.revision,
    proofs: [{ observationId: proof.observationId, analysisId: proof.analysisId }],
    targetUrl: 'https://cedarflow.example/comparison',
    changeDescription: 'Synthetic planned comparison update',
  };
  const followup = (await fixture.request(
    `/geo/actions/${source.id}/follow-ups`,
    input,
    'POST',
  )) as GeoActionDetail;
  expect(followup.action.id).not.toBe(source.id);
  expect(followup.action.status).toBe('accepted');
  expect(followup.evidence.map((row) => row.analysisId)).toEqual([proof.analysisId]);
  expect(followup.events[0]?.details.sourceActionId).toBe(source.id);
  expect(await fixture.request(`/geo/actions/${source.id}/follow-ups`, input, 'POST')).toEqual(
    followup,
  );
  expect(await fixture.request(`/geo/actions/${source.id}`)).toEqual(original);
  await fixture.request('/geo/runs', { requestId: crypto.randomUUID() }, 'POST');
  const saved = (await fixture.request(`/geo/actions/${followup.action.id}`)) as GeoActionDetail;
  expect(saved.evidence.map((row) => row.analysisId)).toEqual([proof.analysisId]);
});
it('runs synthetic monitoring through diagnosis, tasks, completion pins and followup without a network transport', async () => {
  const fixture = new GeoFixtureWorkspace(new Date('2026-10-11T12:00:00Z'));
  const initial = (await fixture.request('/geo/observations')) as GeoObservationPage;
  expect(initial.observations.length).toBeGreaterThan(0);
  expect(
    initial.observations.every(
      (row) => (row.capture.raw as { dataOrigin: string }).dataOrigin === 'fixture',
    ),
  ).toBe(true);
  const [action] = (await fixture.request('/geo/actions')) as GeoAction[];
  if (!action) throw new Error('fixture action');
  const completed = (await fixture.request(
    `/geo/actions/${action.id}/complete`,
    {
      requestId: crypto.randomUUID(),
      revision: action.revision,
      implementedAt: '2026-10-11T11:00:00Z',
      changeDescription: 'Synthetic update to the buyer comparison page.',
    },
    'POST',
  )) as GeoAction;
  expect(completed.status).toBe('completed');
  const detail = (await fixture.request(`/geo/actions/${action.id}`)) as GeoActionDetail;
  expect(detail.events.filter((event) => event.kind === 'completed')).toHaveLength(1);
  const run = (await fixture.request(
    '/geo/runs',
    { requestId: crypto.randomUUID() },
    'POST',
  )) as GeoRun;
  expect(run.items.every((item) => item.status === 'succeeded')).toBe(true);
  const pins = (await fixture.request(
    `/geo/actions/${action.id}/measurements`,
  )) as GeoPinMeasurement[];
  expect(pins).toHaveLength(1);
  expect(pins[0]?.metrics.find((metric) => metric.metric === 'mention')?.limitedData).toBe(true);
  await expect(fixture.request('/scans', { mode: 'today' }, 'POST')).rejects.toThrow(
    'Fixture route unavailable',
  );
});

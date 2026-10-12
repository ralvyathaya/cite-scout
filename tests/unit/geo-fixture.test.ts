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

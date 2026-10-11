import { expect, it } from 'vitest';
import {
  metricValues,
  measurementCohort,
  dailySamples,
  compareSamples,
} from '../../src/domain/geo-measurement';
import type { GeoMetricObservation } from '../../src/shared/geo-measurement';
const row = (
  id: string,
  time = '2026-10-11T09:00:00Z',
): GeoMetricObservation & { analysis: NonNullable<GeoMetricObservation['analysis']> } => ({
  id,
  projectId: 'p',
  capturedAt: time,
  requestedAt: time,
  context: {
    schemaVersion: 'geo-context-1',
    projectId: 'p',
    contextVersion: 1,
    settingsRevision: 1,
    promptId: 'q',
    promptVersionId: 'v',
    promptText: 'Scheduling tools?',
    engine: 'perplexity',
    surface: 'perplexity_agent',
    collector: 'perplexity_api',
    collectorVersion: 'geo-collector-1',
    languageCode: 'en',
    locationCode: 2840,
    device: 'desktop',
    forceWebSearch: false,
    brand: { id: 'b', name: 'Orbit', domain: 'orbit.example' },
    competitors: [],
    instructionVersion: 'neutral-research-1',
    maxOutputTokens: 500,
  },
  capture: {
    model: 'model-1',
    modelReported: true,
    quality: 'complete',
    sources: [],
    inlineReferencesAvailable: false,
  },
  analysis: {
    id: `a-${id}`,
    model: 'clef-flash',
    rubricVersion: 'geo-rubric-1',
    policyVersion: 'geo-policy-1',
    answerQuality: 'usable',
    scope: 'complete',
    brandPresence: 'absent',
    brandStance: 'not_applicable',
  },
});
it('excludes uncertain/partial data and unavailable linkage rather than converting them into zero', () => {
  const valid = row('valid');
  expect(metricValues(valid)).toMatchObject({
    mention: 0,
    recommendation: 0,
    owned_answer_reference: 0,
    owned_inline_reference: null,
  });
  expect(metricValues({ ...valid, analysis: null }).mention).toBeNull();
  expect(
    metricValues({ ...valid, capture: { ...valid.capture, quality: 'partial' } }).mention,
  ).toBeNull();
  expect(
    metricValues({ ...valid, analysis: { ...valid.analysis, brandPresence: 'ambiguous' } }).mention,
  ).toBeNull();
});
it('splits changed reported models/rubrics/prompts but ignores unsupported Perplexity locale and settings revisions', async () => {
  const base = row('one'),
    key = await measurementCohort(base, 'mention');
  expect(
    await measurementCohort(
      { ...base, context: { ...base.context, settingsRevision: 2, locationCode: 2036 } },
      'mention',
    ),
  ).toBe(key);
  expect(
    await measurementCohort({ ...base, capture: { ...base.capture, model: 'model-2' } }, 'mention'),
  ).not.toBe(key);
  expect(
    await measurementCohort(
      { ...base, analysis: { ...base.analysis, rubricVersion: 'new' } },
      'mention',
    ),
  ).not.toBe(key);
  expect(
    await measurementCohort(
      { ...base, context: { ...base.context, promptVersionId: 'v2' } },
      'mention',
    ),
  ).not.toBe(key);
  expect(
    await measurementCohort({ ...base, capture: { ...base.capture, model: null } }, 'mention'),
  ).toBeNull();
  const google = {
    ...base,
    context: {
      ...base.context,
      engine: 'google_aio' as const,
      surface: 'google_ai_overview' as const,
      collector: 'dataforseo_standard' as const,
    },
    capture: { ...base.capture, model: null, modelReported: false },
  };
  expect(await measurementCohort(google, 'mention')).not.toBeNull();
  expect(
    await measurementCohort(
      { ...google, context: { ...google.context, locationCode: 2036 } },
      'mention',
    ),
  ).not.toBe(await measurementCohort(google, 'mention'));
});
it('selects first eligible daily sample after applying the pin cutoff and excludes requests submitted before work', async () => {
  const before = row('before'),
    later = row('later', '2026-10-11T13:00:00Z');
  later.analysis = { ...later.analysis, brandPresence: 'present', brandStance: 'recommended' };
  expect(
    (await dailySamples([later, before], 'trend')).find((s) => s.metric === 'mention')?.value,
  ).toBe(0);
  const cutoff = '2026-10-11T12:00:00Z';
  expect(
    (
      await dailySamples([before, later], 'pin:after', {
        from: cutoff,
        to: '2026-10-18T12:00:00Z',
        requestedAfter: cutoff,
      })
    ).find((s) => s.metric === 'mention')?.observationId,
  ).toBe('later');
  expect(
    await dailySamples([{ ...later, requestedAt: before.requestedAt }], 'pin:after', {
      from: cutoff,
      to: '2026-10-18T12:00:00Z',
      requestedAfter: cutoff,
    }),
  ).toEqual([]);
});
it('allows a limited descriptive comparison with one sample each and marks empty or missing scope inconclusive', () => {
  expect(compareSamples([0], [1], true)).toMatchObject({
    outcome: 'improved',
    before: 0,
    after: 1,
    limitedData: true,
  });
  expect(compareSamples([], [1], true).outcome).toBe('inconclusive');
  expect(compareSamples([0], [1], false).outcome).toBe('inconclusive');
});
it('distinguishes owned answer references from returned results and verified inline linkage', () => {
  const evidence = row('owned');
  evidence.capture.sources = [
    {
      id: 's',
      url: 'https://orbit.example/buyers',
      canonicalUrl: 'https://orbit.example/buyers',
      title: null,
      referenceLevel: 'retrieved',
    },
  ];
  expect(metricValues(evidence).owned_answer_reference).toBe(0);
  const source = evidence.capture.sources[0];
  if (!source) throw new Error('fixture source');
  source.referenceLevel = 'inline_verified';
  evidence.capture.inlineReferencesAvailable = true;
  expect(metricValues(evidence)).toMatchObject({
    owned_answer_reference: 1,
    owned_inline_reference: 1,
  });
});

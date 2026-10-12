import { expect, it, vi } from 'vitest';
import {
  metricValues,
  measurementCohort,
  dailySamples,
  compareSamples,
  compareCohortSamples,
} from '../../src/domain/geo-measurement';
import type { GeoDailySample, GeoMetricObservation } from '../../src/shared/geo-measurement';
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
it('derives only newly eligible metrics while preserving frozen days and admitting changed methods', async () => {
  const earlier = row('earlier'),
    first = row('first', '2026-10-11T10:00:00Z');
  const retained = await dailySamples([first], 'trend');
  const digest = vi.spyOn(crypto.subtle, 'digest');
  try {
    expect(await dailySamples([first], 'trend', undefined, retained)).toEqual([]);
    expect(digest).not.toHaveBeenCalled();
  } finally {
    digest.mockRestore();
  }
  expect(await dailySamples([earlier, first], 'trend', undefined, retained)).toEqual([]);
  const changedMethod = {
    ...earlier,
    analysis: { ...earlier.analysis, model: 'clef' },
  };
  const newSamples = await dailySamples([first, changedMethod], 'trend', undefined, retained);
  expect(newSamples.filter((sample) => sample.metric === 'mention')).toHaveLength(1);
  expect(newSamples.every((sample) => sample.observationId === earlier.id)).toBe(true);
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
it('uses fixed equal cohort weights so changed coverage cannot improve unchanged cohort rates', () => {
  const samples = (side: string, cohort: string, count: number, value: 0 | 1): GeoDailySample[] =>
    Array.from({ length: count }, (_, index) => ({
      series: side,
      cohort,
      metric: 'mention',
      day: `2026-10-${String(index + 1).padStart(2, '0')}`,
      value,
      observationId: `${side}-${cohort}-${String(index)}`,
      analysisId: null,
      capturedAt: '2026-10-01T09:00:00Z',
    }));
  const before = [...samples('before', 'A', 7, 0), ...samples('before', 'B', 1, 1)],
    after = [...samples('after', 'A', 1, 0), ...samples('after', 'B', 7, 1)];
  const comparison = compareCohortSamples(before, after, ['A', 'B', 'A'], true);
  expect(comparison).toMatchObject({
    outcome: 'unchanged',
    before: 0.5,
    after: 0.5,
    beforeSamples: 8,
    afterSamples: 8,
    scopeComplete: true,
    limitedData: true,
  });
  expect(comparison.observationIds).toHaveLength(16);
  expect(
    compareCohortSamples(
      before,
      after.filter((s) => s.cohort === 'A'),
      ['A', 'B'],
      true,
    ),
  ).toMatchObject({ outcome: 'inconclusive', scopeComplete: false });
  expect(compareCohortSamples(before, after, ['A', null], true).outcome).toBe('inconclusive');
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

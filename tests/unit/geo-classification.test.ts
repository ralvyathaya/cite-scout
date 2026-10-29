import { describe, expect, it, vi } from 'vitest';
import { buildGeoEvaluation, projectGeoClassification } from '../../src/domain/geo-classification';
import { evaluateDecision, validateDecision } from '../../src/integrations/decision/client';
import { diagnoseGeo } from '../../src/domain/geo-diagnosis';
import { geoSurfaces, type GeoObservation } from '../../src/shared/geo';

const observation: GeoObservation = {
  id: 'o',
  projectId: 'p',
  runId: 'r',
  itemId: 'i',
  promptVersionId: 'v',
  engine: 'google_aio',
  capturedAt: '2026-10-11T10:00:00Z',
  context: {
    schemaVersion: 'geo-context-1',
    projectId: 'p',
    contextVersion: 1,
    settingsRevision: 1,
    promptId: 'q',
    promptVersionId: 'v',
    promptText: 'Which scheduling tool?',
    engine: 'google_aio',
    surface: geoSurfaces.google_aio.surface,
    collector: 'dataforseo_standard',
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
    schemaVersion: 'geo-capture-1',
    answerText: 'A calendar orbits the earth. Rival is recommended.',
    raw: { original: true },
    model: null,
    modelReported: false,
    sources: [],
    quality: 'complete',
    providerRequestId: 'request',
    providerStatus: '20000',
    reportedCost: 0,
    inputTokens: null,
    outputTokens: null,
    textParts: [],
  },
};
const native = (
  evaluation: ReturnType<typeof buildGeoEvaluation>,
  overrides: Record<string, string> = {},
) => ({
  model: 'clef-flash',
  usage: { input_tokens: 100, output_tokens: 0 },
  answers: Object.fromEntries(
    Object.entries(evaluation.questions).map(([id, q]) => [
      id,
      q.type === 'noul'
        ? { type: 'noul', noul: 0.9 }
        : {
            type: 'choice',
            choice: overrides[id] ?? Object.keys(q.criteria)[0],
            confidence: 0.9,
            probabilities: Object.fromEntries(
              Object.keys(q.criteria).map((option) => [
                option,
                option === (overrides[id] ?? Object.keys(q.criteria)[0]) ? 1 : 0,
              ]),
            ),
          },
    ]),
  ),
});
describe('atomic decision provider contract and grounded diagnosis', () => {
  it.each([
    ['present', 'ambiguous'],
    ['absent', 'unknown'],
  ])(
    'abstains from weak %s entity decisions without editing native evidence',
    (presence, expected) => {
      const evaluation = buildGeoEvaluation(observation);
      const response = native(evaluation, {
        brand_presence: presence,
        brand_stance: 'recommended',
      });
      response.answers.brand_presence = {
        type: 'choice',
        choice: presence,
        confidence: 0.35,
        probabilities: Object.fromEntries(
          ['present', 'absent', 'ambiguous', 'unknown'].map((label) => [
            label,
            label === presence ? 0.7 : 0.1,
          ]),
        ),
      };
      const result = validateDecision(response, evaluation, 'clef-flash');
      const before = structuredClone(result);
      expect(projectGeoClassification(observation, evaluation, result)).toMatchObject({
        brandPresence: expected,
        brandStance: 'unknown',
      });
      expect(result).toEqual(before);
      const previous = {
        rubric: 'geo-rubric-2',
        policy: 'geo-policy-2',
        ownership: 'geo-domain-1',
      };
      expect(
        projectGeoClassification(observation, evaluation, result, previous).brandPresence,
      ).toBe(presence);
    },
  );
  it('keeps analysis of historical SerpApi Google captures partial without rewriting their saved quality', () => {
    const historical = {
      ...observation,
      context: {
        ...observation.context,
        collector: 'serpapi' as const,
        collectorVersion: 'geo-collector-2' as const,
      },
    };
    const before = structuredClone(historical);
    const evaluation = buildGeoEvaluation(historical);
    const result = validateDecision(
      native(evaluation, { brand_presence: 'absent' }),
      evaluation,
      'clef-flash',
    );
    expect(evaluation.state.captureCoverage).toBe('unverified');
    expect(projectGeoClassification(historical, evaluation, result)).toMatchObject({
      scope: 'partial',
      brandPresence: 'unknown',
      brandStance: 'unknown',
    });
    expect(historical).toEqual(before);
    expect(historical.capture.quality).toBe('complete');
  });
  it.each([
    { presence: 'present', confidence: 0.5 },
    { presence: 'absent', confidence: 1 },
    { presence: 'ambiguous', confidence: 0 },
    { presence: 'unknown', confidence: 0 },
  ])('retains $presence at entity confidence $confidence', ({ presence, confidence }) => {
    const evaluation = buildGeoEvaluation(observation);
    const response = native(evaluation, { brand_presence: presence });
    const entity = response.answers.brand_presence;
    if (entity?.type !== 'choice') throw Error('Expected entity choice');
    entity.confidence = confidence;
    const result = validateDecision(response, evaluation, 'clef-flash');
    expect(projectGeoClassification(observation, evaluation, result).brandPresence).toBe(presence);
  });
  it.each(['no_feature', 'complete'] as const)(
    'abstains on an empty %s answer without changing native output',
    (quality) => {
      const empty = {
        ...observation,
        capture: { ...observation.capture, answerText: '', quality },
      };
      const evaluation = buildGeoEvaluation(empty);
      const result = validateDecision(
        native(evaluation, { brand_presence: 'absent' }),
        evaluation,
        'clef-flash',
      );
      const before = structuredClone(result);
      expect(projectGeoClassification(empty, evaluation, result)).toMatchObject({
        answerQuality: 'unknown',
        brandPresence: 'unknown',
        brandStance: 'unknown',
        scope: 'partial',
      });
      expect(result).toEqual(before);
      expect(evaluation.state.captureQuality).toBe(quality);
    },
  );
  it('does not turn absence in a partial capture or classifier excerpt into whole-answer absence', () => {
    for (const capture of [
      { ...observation.capture, quality: 'partial' as const },
      { ...observation.capture, answerText: 'Other options. '.repeat(1000) },
    ]) {
      const partial = { ...observation, capture },
        evaluation = buildGeoEvaluation(partial);
      const result = validateDecision(
        native(evaluation, { brand_presence: 'absent' }),
        evaluation,
        'clef-flash',
      );
      expect(projectGeoClassification(partial, evaluation, result)).toMatchObject({
        brandPresence: 'unknown',
        brandStance: 'unknown',
        scope: 'partial',
      });
    }
  });
  it('uses not-applicable stance for known absence and retains explicit positive evidence in partial text', () => {
    const evaluation = buildGeoEvaluation(observation);
    const absent = validateDecision(
      native(evaluation, { brand_presence: 'absent', brand_stance: 'unknown' }),
      evaluation,
      'clef-flash',
    );
    expect(projectGeoClassification(observation, evaluation, absent).brandStance).toBe(
      'not_applicable',
    );
    const partial = {
      ...observation,
      capture: {
        ...observation.capture,
        quality: 'partial' as const,
        answerText: 'Orbit is useful if you need team scheduling.',
      },
    };
    const partialEvaluation = buildGeoEvaluation(partial);
    const present = validateDecision(
      native(partialEvaluation, {
        brand_presence: 'present',
        brand_stance: 'conditional_recommendation',
      }),
      partialEvaluation,
      'clef-flash',
    );
    expect(projectGeoClassification(partial, partialEvaluation, present)).toMatchObject({
      brandPresence: 'present',
      brandStance: 'conditional_recommendation',
      scope: 'partial',
    });
  });
  it('defines conditional recommendations for both brand and competitor while preserving the legacy rubric', () => {
    const tracked = {
      ...observation,
      context: {
        ...observation.context,
        competitors: [{ id: 'r', name: 'Rival', domain: 'rival.example' }],
      },
    };
    const evaluation = buildGeoEvaluation(tracked);
    for (const id of ['brand_stance', 'competitor_0']) {
      const question = evaluation.questions[id];
      if (question?.type !== 'choice') throw Error('Expected stance question');
      expect(question.criteria.conditional_recommendation).toContain('only if');
    }
    const legacy = { rubric: 'geo-rubric-1', policy: 'geo-policy-1', ownership: 'geo-domain-1' };
    const old = buildGeoEvaluation(tracked, [], [], legacy);
    expect(old.state).not.toHaveProperty('captureQuality');
    expect(old.questions.brand_stance).not.toEqual(evaluation.questions.brand_stance);
    const response = validateDecision(
      native(old, { brand_presence: 'absent', brand_stance: 'unknown' }),
      old,
      'clef-flash',
    );
    expect(projectGeoClassification(tracked, old, response, legacy)).toMatchObject({
      brandPresence: 'absent',
      brandStance: 'unknown',
      rubricVersion: legacy.rubric,
      policyVersion: legacy.policy,
    });
  });
  it('uses Clef Flash binding by default and preserves native probability, quotes and provenance', async () => {
    const evaluation = buildGeoEvaluation(observation);
    const run = vi
      .fn()
      .mockResolvedValue(
        native(evaluation, { brand_presence: 'ambiguous', brand_stance: 'neutral_mention' }),
      );
    const result = await evaluateDecision({ AI: { run } }, evaluation, 'clef-flash');
    expect(run.mock.calls[0]?.[0]).toBe('@cf/cloudflare/clef-flash');
    const classified = projectGeoClassification(observation, evaluation, result);
    expect(classified.brandPresence).toBe('ambiguous');
    expect(classified.evidenceSupport).toBe('unavailable');
    expect(classified.needsReview).toBe(true);
    expect(
      classified.evidence.every(
        (e) => observation.capture.answerText.slice(e.start, e.end) === e.quote,
      ),
    ).toBe(true);
    expect(classified.native.answers.selection_reason).toEqual({ type: 'noul', noul: 0.9 });
    expect(diagnoseGeo(observation, classified)).toEqual([]);
  });
  it('rejects missing fields, arbitrary IDs/options, NaN and malformed distributions', () => {
    const evaluation = buildGeoEvaluation(observation),
      response = native(evaluation);
    expect(() =>
      validateDecision(
        { ...response, answers: { ...response.answers, evil: { type: 'noul', noul: 1 } } },
        evaluation,
        'clef-flash',
      ),
    ).toThrow();
    expect(() =>
      validateDecision({ ...response, answers: {} }, evaluation, 'clef-flash'),
    ).toThrow();
    expect(() =>
      validateDecision(
        {
          ...response,
          answers: {
            ...response.answers,
            brand_presence: {
              type: 'choice',
              choice: 'delete_all',
              confidence: 1,
              probabilities: { delete_all: 1 },
            },
          },
        },
        evaluation,
        'clef-flash',
      ),
    ).toThrow();
    expect(() =>
      validateDecision(
        {
          ...response,
          answers: { ...response.answers, selection_reason: { type: 'noul', noul: NaN } },
        },
        evaluation,
        'clef-flash',
      ),
    ).toThrow();
  });
  it('absence only suspects retrieval and preserves missing checks; multiple issues can coexist', () => {
    const evaluation = buildGeoEvaluation(observation),
      result = validateDecision(
        native(evaluation, {
          brand_presence: 'absent',
          brand_stance: 'discouraged',
          evidence_support: 'insufficient',
        }),
        evaluation,
        'clef-flash',
      );
    const classified = projectGeoClassification(observation, evaluation, result);
    const issues = diagnoseGeo(observation, classified);
    expect(issues.some((d) => d.type === 'retrieval_problem' && d.status === 'suspected')).toBe(
      true,
    );
    expect(issues[0]?.needsReview).toBe(true);
    expect(issues.find((d) => d.type === 'retrieval_problem')?.missingChecks).toContain(
      'inspect_owned_page',
    );
  });
  it('does not diagnose partial or unavailable answers, and marks long semantic input partial without editing raw', () => {
    const partial = {
      ...observation,
      capture: { ...observation.capture, quality: 'partial' as const },
    };
    const evaluation = buildGeoEvaluation(partial),
      classification = projectGeoClassification(
        partial,
        evaluation,
        validateDecision(
          native(evaluation, { brand_presence: 'absent' }),
          evaluation,
          'clef-flash',
        ),
      );
    expect(diagnoseGeo(partial, classification)).toEqual([]);
    const long = {
      ...observation,
      capture: { ...observation.capture, answerText: '😀'.repeat(40000) },
    };
    expect(buildGeoEvaluation(long).scope).toBe('partial');
    expect(new TextEncoder().encode(JSON.stringify(buildGeoEvaluation(long))).length).toBeLessThan(
      24000,
    );
    expect(long.capture.raw).toEqual({ original: true });
  });
});

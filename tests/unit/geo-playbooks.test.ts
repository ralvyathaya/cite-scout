import { expect, it } from 'vitest';
import { actionCandidates, sourceOpportunities } from '../../src/domain/geo-playbooks';
import type { GeoAnalyzedObservation } from '../../src/shared/geo-actions';
const row = (id: string): GeoAnalyzedObservation => ({
  observation: {
    id,
    projectId: 'p',
    runId: id,
    itemId: id,
    promptVersionId: 'v',
    engine: 'perplexity',
    capturedAt: '2026-10-11T12:00:00Z',
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
      competitors: [{ id: 'rival', name: 'Rival', domain: 'rival.example' }],
      instructionVersion: 'neutral-research-1',
      maxOutputTokens: 500,
    },
    capture: {
      schemaVersion: 'geo-capture-1',
      answerText: 'Rival is recommended.',
      raw: { fixture: true },
      model: 'test',
      modelReported: true,
      sources: [
        {
          id: 's',
          url: 'https://reddit.com/r/tools/thread',
          canonicalUrl: 'https://reddit.com/r/tools/thread',
          title: 'Scheduling thread',
          referenceLevel: 'answer',
        },
        {
          id: 'duplicate',
          url: 'https://reddit.com/r/tools/thread',
          canonicalUrl: 'https://reddit.com/r/tools/thread',
          title: null,
          referenceLevel: 'retrieved',
        },
      ],
      quality: 'complete',
      providerRequestId: id,
      providerStatus: '200',
      reportedCost: 0,
      inputTokens: 0,
      outputTokens: 0,
      textParts: [],
    },
  },
  analysis: {
    id: `a-${id}`,
    state: 'completed',
    createdAt: '2026-10-11T12:00:00Z',
    classification: {
      answerQuality: 'usable',
      scope: 'complete',
      competitors: [{ id: 'rival', stance: 'recommended' }],
    },
    diagnoses: [
      {
        type: 'retrieval_problem',
        status: 'suspected',
        reasonCode: 'brand_and_owned_reference_not_observed',
        evidenceIds: [],
        missingChecks: ['inspect_owned_page'],
        templateIds: ['inspect_owned_page'],
        needsReview: true,
      },
    ],
  },
});
it('counts distinct observations and reference strengths without inventing competitor linkage', () => {
  const opportunities = sourceOpportunities([row('one'), row('two'), row('one')]);
  expect(opportunities[0]).toMatchObject({
    observations: 2,
    denominator: 2,
    answerReferences: 2,
    returnedResults: 2,
    competitorCooccurrences: 2,
    competitorLinked: null,
  });
  expect(opportunities[0]?.engines).toEqual(['perplexity']);
});
it('creates specific Owned and Earned inspection briefs, deduplicates assets and preserves proof scope', () => {
  const candidates = actionCandidates([row('one'), row('two')]);
  expect(candidates.filter((action) => action.category === 'owned')).toHaveLength(1);
  expect(candidates.find((action) => action.category === 'owned')?.targetUrl).toBeNull();
  const earned = candidates.find((action) => action.category === 'earned');
  expect(earned?.targetUrl).toBe('https://reddit.com/r/tools/thread');
  expect(earned?.checklist.length).toBeGreaterThan(2);
  expect(earned?.evidence).toHaveLength(2);
  expect(earned?.reason).toContain('2 of 2');
  expect(candidates[0]?.needsReview).toBe(true);
});
it('unknown or partial classification cannot produce optimization tasks', () => {
  const partial = row('partial');
  partial.observation.capture.quality = 'partial';
  expect(actionCandidates([partial])).toEqual([]);
  const unknown = row('unknown');
  if (unknown.analysis.classification) unknown.analysis.classification.answerQuality = 'unknown';
  expect(actionCandidates([unknown])).toEqual([]);
  const scoped = row('scoped');
  if (scoped.analysis.classification)
    Object.assign(scoped.analysis.classification, { scope: 'partial' });
  expect(actionCandidates([scoped])).toEqual([]);
});

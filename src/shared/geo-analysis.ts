import { z } from 'zod';
export const decisionModelSchema = z.enum(['clef-flash', 'clef', 'jev-1.13.0']);
export type DecisionModel = z.infer<typeof decisionModelSchema>;
export const geoVersions = {
  rubric: 'geo-rubric-1',
  policy: 'geo-policy-1',
  ownership: 'geo-domain-1',
} as const;
export type DecisionQuestion =
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'noul'; instructions: string };
export interface EvidenceCandidate {
  id: string;
  start: number;
  end: number;
  quote: string;
}
export interface GeoEvaluation {
  state: Record<string, unknown>;
  questions: Record<string, DecisionQuestion>;
  candidates: EvidenceCandidate[];
  scope: 'complete' | 'partial';
}
const probability = z.number().min(0).max(1);
export const nativeAnswerSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('choice'),
      choice: z.string(),
      confidence: probability,
      probabilities: z.record(z.string(), probability),
    })
    .strict(),
  z.object({ type: z.literal('noul'), noul: probability }).strict(),
]);
export const nativeDecisionSchema = z.object({
  model: z.string().min(1),
  answers: z.record(z.string(), nativeAnswerSchema),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }),
});
export type NativeDecision = z.infer<typeof nativeDecisionSchema>;
export const geoClassificationSchema = z.object({
  schemaVersion: z.literal('geo-analysis-1'),
  observationId: z.string(),
  model: z.string(),
  provider: z.enum(['workers_ai', 'typesafe']),
  rubricVersion: z.string(),
  policyVersion: z.string(),
  ownershipVersion: z.string(),
  scope: z.enum(['complete', 'partial']),
  needsReview: z.literal(true),
  answerQuality: z.enum(['usable', 'irrelevant', 'refusal', 'incomplete', 'unknown']),
  brandPresence: z.enum(['present', 'absent', 'ambiguous', 'unknown']),
  brandStance: z.enum([
    'recommended',
    'conditional_recommendation',
    'neutral_mention',
    'discouraged',
    'not_applicable',
    'unknown',
  ]),
  fitByCriterion: z.record(
    z.string(),
    z.enum(['meets', 'partial', 'mismatch', 'unclear', 'not_applicable']),
  ),
  evidenceSupport: z.enum([
    'supported',
    'insufficient',
    'contradicted',
    'unavailable',
    'not_applicable',
    'unknown',
  ]),
  competitors: z.array(z.object({ id: z.string(), stance: z.string() })),
  evidence: z.array(
    z.object({
      id: z.string(),
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative(),
      quote: z.string(),
      supportProbability: probability,
    }),
  ),
  sources: z.array(
    z.object({
      id: z.string(),
      role: z.enum(['owned', 'competitor_owned', 'third_party', 'unknown']),
      type: z.enum([
        'editorial',
        'review_directory',
        'community',
        'official_product',
        'other',
        'unknown',
      ]),
    }),
  ),
  native: nativeDecisionSchema,
});
export type GeoClassification = z.infer<typeof geoClassificationSchema>;
export type GeoIssue = 'retrieval_problem' | 'evidence_problem' | 'recommendation_fit_problem';
export const geoDiagnosisSchema = z.object({
  type: z.enum(['retrieval_problem', 'evidence_problem', 'recommendation_fit_problem']),
  status: z.enum(['suspected', 'supported', 'ruled_out', 'unknown']),
  reasonCode: z.string(),
  evidenceIds: z.array(z.string()),
  checkIds: z.array(z.string()).optional(),
  targetUrl: z.url().nullable().optional(),
  missingChecks: z.array(z.string()),
  templateIds: z.array(
    z.enum([
      'inspect_owned_page',
      'fix_page_access',
      'verify_buyer_evidence',
      'clarify_product_fit',
    ]),
  ),
  needsReview: z.literal(true),
});
export type GeoDiagnosis = z.infer<typeof geoDiagnosisSchema>;
export interface GeoPageCheck {
  id: string;
  target: string;
  finalUrl: string | null;
  status: 'checked' | 'unavailable' | 'rejected';
  httpStatus: number | null;
  noindex: boolean | null;
  canonical: string | null;
  robots: string | null;
  excerpt: string | null;
  checkedAt: string;
  reason: string | null;
}
const analysisMetadata = z.object({
  id: z.string(),
  observationId: z.string(),
  model: decisionModelSchema,
  rubricVersion: z.string(),
  policyVersion: z.string(),
  inputHash: z.string().nullable(),
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  latencyMs: z.number().nonnegative().nullable(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  estimatedCostUsd: z.number().nonnegative().nullable(),
});
export const geoAnalysisSchema = z.discriminatedUnion('state', [
  analysisMetadata.extend({
    state: z.literal('completed'),
    classification: geoClassificationSchema,
    diagnoses: z.array(geoDiagnosisSchema),
    failureCode: z.null(),
  }),
  ...(['queued', 'running', 'failed'] as const).map((state) =>
    analysisMetadata.extend({
      state: z.literal(state),
      classification: z.null(),
      diagnoses: z.array(geoDiagnosisSchema).max(0),
      failureCode: z.string().nullable(),
    }),
  ),
]);
export type GeoAnalysis = z.infer<typeof geoAnalysisSchema>;

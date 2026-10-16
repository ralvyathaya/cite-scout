import { z } from 'zod';
import type { GeoEngine, GeoObservation, GeoRequestContext } from './geo';
import type { GeoAnalysis, GeoDiagnosis, GeoClassification } from './geo-analysis';
export interface GeoAnalyzedObservation {
  observation: GeoObservation;
  analysis: {
    id: string;
    state: GeoAnalysis['state'];
    createdAt: string;
    classification: Pick<GeoClassification, 'answerQuality' | 'scope' | 'competitors'> | null;
    diagnoses: GeoDiagnosis[];
  };
}
export interface GeoSourceOpportunity {
  url: string;
  title: string | null;
  domain: string;
  role: 'owned' | 'competitor_owned' | 'third_party' | 'unknown';
  observations: number;
  denominator: number;
  returnedResults: number;
  answerReferences: number;
  inlineReferences: number;
  competitorCooccurrences: number;
  competitorLinked: null;
  engines: GeoEngine[];
  observationIds: string[];
  period: { from: string; to: string };
}
export interface GeoActionScope {
  observationId: string;
  analysisId: string;
  context: GeoRequestContext;
  capturedAt: string;
}
export interface GeoActionCandidate {
  dedupeKey: string;
  templateId: GeoDiagnosis['templateIds'][number] | 'inspect_earned_source';
  templateVersion: 'geo-template-1';
  category: 'owned' | 'earned';
  issue: string;
  title: string;
  reason: string;
  targetUrl: string | null;
  targetDomain: string | null;
  priority: 1 | 2 | 3;
  priorityReason: string;
  effort: string;
  checklist: { id: string; text: string }[];
  deliverable: string;
  doneCriteria: string;
  needsReview: true;
  evidence: GeoActionEvidence[];
}
export type GeoActionStatus = 'proposed' | 'accepted' | 'in_progress' | 'dismissed' | 'completed';
export interface GeoAction extends Omit<GeoActionCandidate, 'evidence'> {
  id: string;
  projectId: string;
  status: GeoActionStatus;
  revision: number;
  checkedIds: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
  evidenceCount: number;
  scopes: GeoActionScope[];
}
export interface GeoActionEvent {
  id: string;
  actionId: string;
  kind: 'accepted' | 'dismissed' | 'progress' | 'completed' | 'reopened';
  recordedAt: string;
  details: Record<string, unknown>;
  scopes: GeoActionScope[];
  evidenceIds: string[];
}
export const geoActionPatchSchema = z
  .object({
    requestId: z.uuid(),
    revision: z.number().int().positive(),
    status: z.enum(['accepted', 'in_progress', 'dismissed']).optional(),
    checkedIds: z.array(z.string().min(1).max(100)).max(20).optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine(
    (value) =>
      value.status !== undefined || value.checkedIds !== undefined || value.notes !== undefined,
  );
export type GeoActionPatch = z.infer<typeof geoActionPatchSchema>;
export const geoFollowUpSchema = z
  .object({
    requestId: z.uuid(),
    revision: z.number().int().positive(),
    proofs: z
      .array(
        z
          .object({
            observationId: z.string().min(1).max(100),
            analysisId: z.string().min(1).max(100),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    targetUrl: z.url().max(2000),
    changeDescription: z.string().trim().min(1).max(2000),
  })
  .strict();
export type GeoFollowUpInput = z.infer<typeof geoFollowUpSchema>;
export interface GeoActionEvidence {
  observationId: string;
  analysisId: string;
  evidenceIds: string[];
  scope: GeoActionScope;
}
export interface GeoActionDetail {
  action: GeoAction;
  evidence: GeoActionEvidence[];
  events: GeoActionEvent[];
  nextEvidenceCursor: string | null;
}

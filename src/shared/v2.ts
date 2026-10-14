import type { EvidenceCapture, EvidenceDelta, RequestContext } from './evidence';

export interface V2Question {
  id: string;
  text: string;
  enabled: boolean;
  archivedAt: string | null;
  updatedAt: string;
  replacesQuestionId: string | null;
}
export interface V2Project {
  id: string;
  brandName: string;
  canonicalDomain: string;
  contextVersion: number;
  competitors: { id: string; name: string; canonicalDomain: string | null }[];
  questions: V2Question[];
}
export interface V2ProjectPayload {
  project: V2Project | null;
  enrolled: boolean;
  canScan: boolean;
  internalTestAccess: boolean;
  trial: {
    state: string;
    startedAt: string | null;
    expiresAt: string | null;
    followupDueAt: string | null;
  } | null;
  usage: {
    today: number;
    month: number;
    dailyLimit: number;
    monthlyLimit: number;
    resetAt: string;
    monthlyResetAt: string;
  };
  scansEnabled: boolean;
  supportEmail: string;
}
export interface V2Observation {
  id: string;
  questionId: string;
  questionText: string;
  capturedAt: string;
  evidenceVersion: string;
  context: RequestContext | null;
  capture: EvidenceCapture | null;
  legacyText: string | null;
  legacySources: { url: string; title: string | null }[];
}
export interface V2QuestionRow extends V2Question {
  latest: { id: string; capturedAt: string; brandMatched: boolean; competitors: string[] } | null;
  latestAttempt: { status: string; failureCode: string | null; at: string } | null;
  previousId: string | null;
  baselineId: string | null;
  delta: EvidenceDelta | null;
  stale: boolean;
  contextChanged: boolean;
  needsAttention: boolean;
}
export interface V2QuestionsPayload {
  questions: V2QuestionRow[];
  summary: {
    tracked: number;
    available: number;
    brandMatched: number;
    comparable: number;
    changed: number;
    sourcesUnavailable: number;
    from: string | null;
    to: string | null;
  };
}
export interface V2HistoryEntry {
  id: string;
  kind: 'observation' | 'attempt';
  at: string;
  status: string;
  evidenceVersion: string | null;
  failureCode: string | null;
}
export interface V2HistoryPayload {
  question: V2Question;
  entries: V2HistoryEntry[];
  nextCursor: string | null;
}
export interface V2ObservationPayload {
  observation: V2Observation;
  comparison: V2Observation | null;
  previousId: string | null;
  baselineId: string | null;
  delta: EvidenceDelta | null;
  comparisonReason: string | null;
}

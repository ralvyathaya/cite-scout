import type { CitationOpportunity, ObservationInsight } from '../domain/insights';
import type { Entitlement } from '../domain/entitlements';

export interface DailyPoint {
  date: string;
  visibilityScore: number | null;
  mentionRate: number | null;
  shareOfVoice: number | null;
  averageMentionPosition: number | null;
  coverage: number | null;
  successful: number;
  attempted: number;
}
export interface DashboardSnapshot {
  projectId: string;
  brandName: string;
  canonicalDomain: string;
  observationDate: string;
  latestObservationDate: string | null;
  windowDays: number;
  current: Omit<DailyPoint, 'date'>;
  delta: {
    visibilityScore: number | null;
    mentionRate: number | null;
    shareOfVoice: number | null;
  };
  shareOfVoiceByEntity: { key: string; label: string; share: number | null; mentions: number }[];
  series: DailyPoint[];
  prompts: {
    promptId: string;
    text: string;
    enabled: boolean;
    classified: string | null;
    brandPosition: number | null;
    observationId: string | null;
    observationDate: string | null;
    insight: ObservationInsight;
    attemptStatus: string | null;
  }[];
  citationOpportunities: CitationOpportunity[];
  scanRuns: {
    id: string;
    triggerType: string;
    status: string;
    observationDate: string;
    successfulCount: number;
    failedCount: number;
    attemptedCount: number;
  }[];
  lastSuccessfulAt: string | null;
  provider: { name: string; model: string | null; preset: string | null } | null;
}
export interface DashboardPayload extends DashboardSnapshot {
  entitlement: Entitlement;
  totalObservations: number;
  scanAvailability: {
    trialAvailable: boolean;
    manualAvailable: boolean;
    eligiblePromptIds: string[];
    reason: string | null;
  };
}

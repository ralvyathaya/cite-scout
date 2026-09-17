/** Shared client-side view helpers and the authenticated dashboard loader. */

export interface DashboardPayload {
  projectId: string;
  brandName: string;
  canonicalDomain: string;
  observationDate: string;
  current: {
    visibilityScore: number | null;
    mentionRate: number | null;
    shareOfVoice: number | null;
    averageMentionPosition: number | null;
    coverage: number | null;
  };
  delta: {
    visibilityScore: number | null;
    mentionRate: number | null;
    shareOfVoice: number | null;
  };
  shareOfVoiceByEntity: { key: string; label: string; share: number | null; mentions: number }[];
  series: {
    date: string;
    visibilityScore: number | null;
    coverage: number | null;
    successful: number;
    attempted: number;
  }[];
  prompts: {
    promptId: string;
    text: string;
    classified: string | null;
    brandPosition: number | null;
    observationDate: string | null;
  }[];
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
  entitlement: {
    canScan: boolean;
    hasPaidFeatures: boolean;
    warning: 'payment' | 'paused' | 'expired' | null;
  };
  totalObservations: number;
}

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'onboarding' }
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string };

export function fmtPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? 'Not enough data' : `${(value * 100).toFixed(0)}%`;
}

export function fmtScore(value: number | null | undefined): string {
  return value === null || value === undefined ? 'Not enough data' : value.toFixed(1);
}

export function fmtPosition(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `#${value.toFixed(1)}`;
}

export function fmtDelta(value: number | null | undefined, kind: 'score' | 'percent'): string {
  if (value === null || value === undefined) return 'Not enough data';
  const sign = value > 0 ? '+' : '';
  return kind === 'score' ? `${sign}${value.toFixed(1)}` : `${sign}${(value * 100).toFixed(0)} pp`;
}

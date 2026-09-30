/** Shared client-side view helpers and the authenticated dashboard loader. */

export type { DashboardPayload } from '@/shared/dashboard';

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

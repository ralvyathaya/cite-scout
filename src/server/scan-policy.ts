import { utcDate } from '../domain/normalization';

// These expressions are used inside conditional writes, not as an authorization preflight.
export const paidProjectSql = `EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = p.user_id
  AND (s.status = 'active' OR (s.status = 'cancelled' AND s.ends_at > ?)))`;

export function monthBounds(now: Date): [string, string] {
  return [
    utcDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))),
    utcDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))),
  ];
}

export interface ScanAvailability {
  trialAvailable: boolean;
  manualAvailable: boolean;
  eligiblePromptIds: string[];
  reason: string | null;
}

import { describe, expect, it } from 'vitest';
import { getEntitlement } from '../../src/domain/entitlements';

const now = new Date('2026-09-16T12:00:00Z');
describe('subscription entitlement', () => {
  it('allows active and cancellation grace access', () => {
    expect(getEntitlement({ status: 'active', endsAt: null }, now).canScan).toBe(true);
    expect(
      getEntitlement({ status: 'cancelled', endsAt: new Date('2026-09-17') }, now).canScan,
    ).toBe(true);
  });
  it('stops expired cancellation, paused and payment-risk scans', () => {
    expect(
      getEntitlement({ status: 'cancelled', endsAt: new Date('2026-09-15') }, now).canScan,
    ).toBe(false);
    expect(getEntitlement({ status: 'paused', endsAt: null }, now).warning).toBe('paused');
    expect(getEntitlement({ status: 'past_due', endsAt: null }, now).warning).toBe('payment');
  });
  it('does not intentionally enable provider trials', () => {
    expect(getEntitlement({ status: 'on_trial', endsAt: null }, now).canScan).toBe(false);
  });
});

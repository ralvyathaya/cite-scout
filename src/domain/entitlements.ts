export type SubscriptionStatus =
  'on_trial' | 'active' | 'paused' | 'past_due' | 'unpaid' | 'cancelled' | 'expired';
export interface SubscriptionState {
  status: SubscriptionStatus;
  endsAt: Date | null;
}
export interface Entitlement {
  canScan: boolean;
  hasPaidFeatures: boolean;
  warning: 'payment' | 'paused' | 'expired' | null;
}

export function getEntitlement(
  subscription: SubscriptionState | null,
  now: Date,
  allowProviderTrial = false,
): Entitlement {
  if (!subscription) return { canScan: false, hasPaidFeatures: false, warning: null };
  if (
    subscription.status === 'active' ||
    (subscription.status === 'on_trial' && allowProviderTrial)
  )
    return { canScan: true, hasPaidFeatures: true, warning: null };
  if (
    subscription.status === 'cancelled' &&
    subscription.endsAt &&
    subscription.endsAt.getTime() > now.getTime()
  )
    return { canScan: true, hasPaidFeatures: true, warning: null };
  if (subscription.status === 'past_due' || subscription.status === 'unpaid')
    return { canScan: false, hasPaidFeatures: true, warning: 'payment' };
  if (subscription.status === 'paused')
    return { canScan: false, hasPaidFeatures: true, warning: 'paused' };
  return { canScan: false, hasPaidFeatures: true, warning: 'expired' };
}

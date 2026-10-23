import {
  billingSelectionSchema,
  type BillingSelection,
  type SubscriptionPlan,
} from '@/shared/plans';

export function billingSelection(params: URLSearchParams) {
  const result = billingSelectionSchema.safeParse({
    planId: params.get('planId'),
    interval: params.get('interval'),
  });
  return result.success ? result.data : null;
}

export function billingSelectionQuery(params: URLSearchParams): string {
  const selection = billingSelection(params);
  return selection ? `?${new URLSearchParams(selection).toString()}` : '';
}

export interface PlanBillingStatus {
  plan?: SubscriptionPlan | null;
  plansEnabled?: boolean;
  checkoutOptions?: (BillingSelection & { available: boolean })[];
  allowance?: { promptLimit: number; dailyChecks: number; monthlyChecks: number } | null;
}

export function subscriptionLabel(plan: SubscriptionPlan | null | undefined): string {
  if (!plan) return 'Plan details unavailable. Your subscription has not been changed.';
  return plan.interval === 'year'
    ? `${plan.name} · $${String(plan.annualPriceUsd)} / year · ${String(plan.promptLimit)} active prompts`
    : `${plan.name} · $${String(plan.monthlyPriceUsd)} / month · ${String(plan.promptLimit)} active prompts`;
}

import { z } from 'zod';
import type { GeoEngine } from './geo';

export const billingPlanIdSchema = z.enum(['starter', 'growth', 'pro']);
export const billingIntervalSchema = z.enum(['month', 'year']);
export const billingSelectionSchema = z
  .object({
    planId: billingPlanIdSchema,
    interval: billingIntervalSchema,
  })
  .strict();
export type BillingPlanId = z.infer<typeof billingPlanIdSchema>;
export type BillingInterval = z.infer<typeof billingIntervalSchema>;
export type BillingSelection = z.infer<typeof billingSelectionSchema>;

export interface BillingPlan {
  id: BillingPlanId | 'legacy_perplexity';
  name: string;
  monthlyPriceUsd: number;
  annualPriceUsd: number | null;
  promptLimit: number;
  dailyChecks: number;
  engines: readonly GeoEngine[];
}
const engines = ['perplexity', 'openai_web_search', 'google_aio'] as const;
export const publicPlans = [
  {
    id: 'starter',
    name: 'Starter',
    monthlyPriceUsd: 29,
    annualPriceUsd: 290,
    promptLimit: 5,
    dailyChecks: 15,
    engines,
  },
  {
    id: 'growth',
    name: 'Growth',
    monthlyPriceUsd: 79,
    annualPriceUsd: 790,
    promptLimit: 15,
    dailyChecks: 45,
    engines,
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPriceUsd: 149,
    annualPriceUsd: 1490,
    promptLimit: 30,
    dailyChecks: 90,
    engines,
  },
] as const satisfies readonly BillingPlan[];
export const legacyPlan = {
  id: 'legacy_perplexity',
  name: 'Perplexity monitoring',
  monthlyPriceUsd: 19,
  annualPriceUsd: null,
  promptLimit: 10,
  dailyChecks: 10,
  engines: ['perplexity'],
} as const satisfies BillingPlan;
export type SubscriptionPlan = BillingPlan & { interval: BillingInterval };

export function planPrice(plan: BillingPlan, interval: BillingInterval): number {
  if (interval === 'month') return plan.monthlyPriceUsd;
  if (plan.annualPriceUsd === null) throw new Error('ANNUAL_PLAN_UNAVAILABLE');
  return plan.annualPriceUsd;
}

export function monthlyCheckLimit(plan: BillingPlan, at: Date): number {
  return (
    plan.dailyChecks * new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 0)).getUTCDate()
  );
}

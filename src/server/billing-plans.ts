import { z } from 'zod';
import {
  legacyPlan,
  publicPlans,
  type BillingSelection,
  type SubscriptionPlan,
} from '../shared/plans';

export interface BillingPlanBindings {
  LEMON_SQUEEZY_STORE_ID: string;
  LEMON_SQUEEZY_PRODUCT_ID: string;
  LEMON_SQUEEZY_VARIANT_ID: string;
  LEMON_SQUEEZY_TEST_MODE: string;
  BILLING_PLAN_VARIANTS?: string;
  BILLING_PLANS_ENABLED?: string;
}
const cadenceVariants = z
  .object({
    month: z
      .string()
      .regex(/^[1-9]\d*$/)
      .optional(),
    year: z
      .string()
      .regex(/^[1-9]\d*$/)
      .optional(),
  })
  .strict();
const modeVariants = z
  .object({
    starter: cadenceVariants.optional(),
    growth: cadenceVariants.optional(),
    pro: cadenceVariants.optional(),
  })
  .strict();
const variantSchema = z
  .object({ test: modeVariants.optional(), live: modeVariants.optional() })
  .strict();

export function billingPlanVariants(env: BillingPlanBindings) {
  const parsed = variantSchema.safeParse(
    (() => {
      try {
        return JSON.parse(env.BILLING_PLAN_VARIANTS || '{}') as unknown;
      } catch {
        return null;
      }
    })(),
  );
  if (!parsed.success) throw new Error('INVALID_BILLING_PLAN_VARIANTS');
  const ids = Object.values(parsed.data).flatMap((mode) =>
    Object.values(mode).flatMap((cadence) => Object.values(cadence)),
  );
  if (new Set(ids).size !== ids.length || ids.includes(env.LEMON_SQUEEZY_VARIANT_ID))
    throw new Error('INVALID_BILLING_PLAN_VARIANTS');
  return parsed.data[env.LEMON_SQUEEZY_TEST_MODE === 'true' ? 'test' : 'live'] ?? {};
}

export function billingVariantId(
  env: BillingPlanBindings,
  selection: BillingSelection,
): string | null {
  return billingPlanVariants(env)[selection.planId]?.[selection.interval] ?? null;
}

export interface StoredPlanIdentity {
  lemonSqueezyStoreId: string;
  lemonSqueezyProductId: string;
  lemonSqueezyVariantId: string;
  testMode: boolean;
}
export function subscriptionPlan(
  env: BillingPlanBindings,
  sub: StoredPlanIdentity | null,
): SubscriptionPlan | null {
  if (
    !sub ||
    sub.testMode !== (env.LEMON_SQUEEZY_TEST_MODE === 'true') ||
    sub.lemonSqueezyStoreId !== env.LEMON_SQUEEZY_STORE_ID ||
    sub.lemonSqueezyProductId !== env.LEMON_SQUEEZY_PRODUCT_ID
  )
    return null;
  if (sub.lemonSqueezyVariantId === env.LEMON_SQUEEZY_VARIANT_ID)
    return { ...legacyPlan, interval: 'month' };
  const variants = billingPlanVariants(env);
  for (const plan of publicPlans) {
    for (const interval of ['month', 'year'] as const) {
      if (variants[plan.id]?.[interval] === sub.lemonSqueezyVariantId) return { ...plan, interval };
    }
  }
  return null;
}

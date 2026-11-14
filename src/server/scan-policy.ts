import { utcDate } from '../domain/normalization';
import { billingPlanVariants, type BillingPlanBindings } from './billing-plans';
import { legacyPlan, publicPlans } from '../shared/plans';

// These expressions are used inside conditional writes, not as an authorization preflight.
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
export function paidProjectSql(env: BillingPlanBindings, mode: 'legacy' | 'geo' | 'all' = 'all') {
  const ids =
    mode === 'legacy'
      ? []
      : Object.values(billingPlanVariants(env)).flatMap((v) => Object.values(v));
  if (mode !== 'geo' && env.LEMON_SQUEEZY_VARIANT_ID) ids.push(env.LEMON_SQUEEZY_VARIANT_ID);
  return `EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = p.user_id
    AND s.test_mode=${env.LEMON_SQUEEZY_TEST_MODE === 'true' ? '1' : '0'}
    AND s.lemon_squeezy_store_id=${literal(env.LEMON_SQUEEZY_STORE_ID)}
    AND s.lemon_squeezy_product_id=${literal(env.LEMON_SQUEEZY_PRODUCT_ID)}
    AND s.lemon_squeezy_variant_id IN (${ids.map(literal).join(',') || "''"})
    AND (s.status = 'active' OR (s.status = 'cancelled' AND s.ends_at > ?)))`;
}

export function planLimitSql(
  env: BillingPlanBindings,
  field: 'promptLimit' | 'dailyChecks',
  includeLegacy = false,
) {
  const variants = billingPlanVariants(env);
  const cases = publicPlans.flatMap((plan) =>
    Object.values(variants[plan.id] ?? {}).map(
      (id) => `WHEN ${literal(id)} THEN ${String(plan[field])}`,
    ),
  );
  if (includeLegacy && env.LEMON_SQUEEZY_VARIANT_ID)
    cases.push(`WHEN ${literal(env.LEMON_SQUEEZY_VARIANT_ID)} THEN ${String(legacyPlan[field])}`);
  if (!cases.length) return '0';
  return `(SELECT CASE s.lemon_squeezy_variant_id ${cases.join(' ')} ELSE 0 END FROM subscriptions s WHERE s.user_id=p.user_id)`;
}

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

export const customerSlotReservationSql = (alias = 'v') =>
  `(${alias}.status<>'deferred' AND (${alias}.status<>'failed' OR ${alias}.item_id IS NULL OR EXISTS(SELECT 1 FROM geo_provider_requests pr WHERE pr.reservation_id=${alias}.id)))`;

import { z } from 'zod';
import { planPrice, publicPlans } from '../shared/plans';

const dollars = z.number().nonnegative();
const ratio = z.number().min(0).max(1);
const economicsSchema = z
  .object({
    monthDays: z.number().int().min(28).max(31),
    accounts: z
      .object({
        starter: z.number().int().nonnegative(),
        growth: z.number().int().nonnegative(),
        pro: z.number().int().nonnegative(),
      })
      .strict()
      .refine(
        (accounts) => accounts.starter + accounts.growth + accounts.pro > 0,
        'At least one account is required.',
      ),
    googleRequestsPerCheck: z.number().int().min(1).max(2),
    searchPlan: z
      .object({
        monthlyUsd: dollars,
        monthlySearches: z.number().int().nonnegative(),
        otherMonthlySearches: z.number().int().nonnegative(),
        headroomFraction: ratio,
      })
      .strict(),
    costs: z
      .object({
        perplexityPerCheckUsd: dollars.nullable(),
        openaiPerCheckUsd: dollars.nullable(),
        classificationPerCheckUsd: dollars.nullable(),
        infrastructurePerAccountUsd: dollars.nullable(),
      })
      .strict(),
    payment: z.object({ rate: ratio, perTransactionUsd: dollars }).strict(),
    reserveFraction: ratio,
    evidence: z
      .object({
        providerRatesVerified: z.boolean(),
        completeCapturesVerified: z.boolean(),
        billingLifecycleVerified: z.boolean(),
      })
      .strict(),
  })
  .strict();

export function evaluatePlanEconomics(value: unknown) {
  const input = economicsSchema.parse(value);
  const totalPrompts = publicPlans.reduce(
    (sum, p) => sum + p.promptLimit * input.accounts[p.id],
    0,
  );
  const searchRequests = totalPrompts * input.monthDays * input.googleRequestsPerCheck;
  const requiredSearchCapacity = Math.ceil(
    (searchRequests + input.searchPlan.otherMonthlySearches) *
      (1 + input.searchPlan.headroomFraction),
  );
  const {
    perplexityPerCheckUsd,
    openaiPerCheckUsd,
    classificationPerCheckUsd,
    infrastructurePerAccountUsd,
  } = input.costs;
  const known =
    perplexityPerCheckUsd !== null &&
    openaiPerCheckUsd !== null &&
    classificationPerCheckUsd !== null &&
    infrastructurePerAccountUsd !== null;
  const plans = publicPlans.flatMap((plan) => {
    const searchAllocationUsd = (input.searchPlan.monthlyUsd * plan.promptLimit) / totalPrompts;
    const engineChecks = plan.promptLimit * input.monthDays;
    const serviceCostUsd = known
      ? (engineChecks *
          (perplexityPerCheckUsd + openaiPerCheckUsd + 3 * classificationPerCheckUsd) +
          searchAllocationUsd) *
          (1 + input.reserveFraction) +
        infrastructurePerAccountUsd
      : null;
    return (['month', 'year'] as const).map((interval) => {
      const divisor = interval === 'year' ? 12 : 1;
      const monthlyRevenueUsd = planPrice(plan, interval) / divisor;
      const monthlyPaymentFeeUsd =
        (planPrice(plan, interval) * input.payment.rate + input.payment.perTransactionUsd) /
        divisor;
      const maximumServiceCostUsd = monthlyRevenueUsd * 0.4 - monthlyPaymentFeeUsd;
      return {
        planId: plan.id,
        interval,
        monthlyRevenueUsd,
        monthlyPaymentFeeUsd,
        searchAllocationUsd,
        serviceCostUsd,
        maximumServiceCostUsd,
        costReductionRequiredUsd:
          serviceCostUsd === null ? null : Math.max(0, serviceCostUsd - maximumServiceCostUsd),
        contribution:
          serviceCostUsd === null
            ? null
            : (monthlyRevenueUsd - monthlyPaymentFeeUsd - serviceCostUsd) / monthlyRevenueUsd,
      };
    });
  });
  const blockers: string[] = [];
  if (!known) blockers.push('Provider costs are incomplete.');
  if (requiredSearchCapacity > input.searchPlan.monthlySearches)
    blockers.push('Shared search capacity is insufficient.');
  if (!Object.values(input.evidence).every(Boolean))
    blockers.push('Verified provider costs, complete captures and billing evidence are required.');
  if (plans.some((plan) => plan.contribution === null || plan.contribution < 0.6))
    blockers.push('At least one package/cadence misses the 60% contribution target.');
  return {
    ready: blockers.length === 0,
    targetContribution: 0.6,
    searchRequests,
    requiredSearchCapacity,
    plans,
    blockers,
  };
}

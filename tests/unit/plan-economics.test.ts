import { describe, expect, it } from 'vitest';
import { evaluatePlanEconomics } from '../../src/domain/plan-economics';

const input = {
  monthDays: 31,
  accounts: { starter: 5, growth: 4, pro: 1 },
  googleRequestsPerCheck: 2,
  searchPlan: {
    monthlyUsd: 150,
    monthlySearches: 15000,
    otherMonthlySearches: 0,
    headroomFraction: 0.2,
  },
  costs: {
    perplexityPerCheckUsd: 0.00356,
    openaiPerCheckUsd: 0.01152175,
    classificationPerCheckUsd: 0.0000984238,
    infrastructurePerAccountUsd: 2,
  },
  payment: { rate: 0.055, perTransactionUsd: 0.5 },
  reserveFraction: 0.25,
  evidence: {
    providerRatesVerified: false,
    completeCapturesVerified: false,
    billingLifecycleVerified: false,
  },
};
describe('package economics release gate', () => {
  it('reports the maximum service cost and required savings without changing prices', () => {
    const report = evaluatePlanEconomics(input);
    for (const plan of report.plans) {
      expect(plan.maximumServiceCostUsd).toBeCloseTo(
        plan.monthlyRevenueUsd * 0.4 - plan.monthlyPaymentFeeUsd,
      );
      expect(plan.costReductionRequiredUsd).toBeCloseTo(
        Math.max(0, (plan.serviceCostUsd ?? 0) - plan.maximumServiceCostUsd),
      );
    }
    const unknown = evaluatePlanEconomics({
      ...input,
      costs: { ...input.costs, openaiPerCheckUsd: null },
    });
    expect(unknown.plans[0]?.costReductionRequiredUsd).toBeNull();
  });
  it('can model one customer tier without inventing accounts in other tiers', () => {
    const report = evaluatePlanEconomics({ ...input, accounts: { starter: 1, growth: 0, pro: 0 } });
    expect(report.searchRequests).toBe(310);
    expect(report.plans.find((p) => p.planId === 'starter')?.searchAllocationUsd).toBe(150);
    expect(() =>
      evaluatePlanEconomics({ ...input, accounts: { starter: 0, growth: 0, pro: 0 } }),
    ).toThrow();
  });
  it.each([
    'providerRatesVerified',
    'completeCapturesVerified',
    'billingLifecycleVerified',
  ] as const)('blocks profitable scenarios missing %s', (missing) => {
    const report = evaluatePlanEconomics({
      ...input,
      costs: {
        perplexityPerCheckUsd: 0,
        openaiPerCheckUsd: 0,
        classificationPerCheckUsd: 0,
        infrastructurePerAccountUsd: 0,
      },
      searchPlan: { ...input.searchPlan, monthlyUsd: 0 },
      evidence: {
        providerRatesVerified: true,
        completeCapturesVerified: true,
        billingLifecycleVerified: true,
        [missing]: false,
      },
    });
    expect(report.plans.every((p) => p.contribution !== null && p.contribution >= 0.6)).toBe(true);
    expect(report.ready).toBe(false);
  });
  it('charges the shared search bill once, including headroom and both Google requests', () => {
    const report = evaluatePlanEconomics(input);
    expect(report.searchRequests).toBe(7130);
    expect(report.requiredSearchCapacity).toBe(8556);
    const allocated = report.plans
      .filter((p) => p.interval === 'month')
      .reduce((sum, p) => sum + p.searchAllocationUsd * input.accounts[p.planId], 0);
    expect(allocated).toBeCloseTo(150);
    expect(report.ready).toBe(false);
    expect(report.plans).toHaveLength(6);
  });
  it('keeps annual usage unchanged and amortizes one annual transaction, not twelve', () => {
    const report = evaluatePlanEconomics(input);
    const monthly = report.plans.find((p) => p.planId === 'starter' && p.interval === 'month');
    const annual = report.plans.find((p) => p.planId === 'starter' && p.interval === 'year');
    if (!monthly || !annual) throw new Error('Missing Starter pricing');
    expect(annual.serviceCostUsd).toBe(monthly.serviceCostUsd);
    expect(annual.monthlyRevenueUsd).toBeCloseTo(290 / 12);
    expect(annual.monthlyPaymentFeeUsd).toBeCloseTo((290 * 0.055 + 0.5) / 12);
    expect(annual.contribution).toBeLessThan(0.6);
  });
  it('does not turn unknown provider costs into zero or approve an undersized search plan', () => {
    const unknown = evaluatePlanEconomics({
      ...input,
      costs: { ...input.costs, openaiPerCheckUsd: null },
    });
    expect(unknown.ready).toBe(false);
    expect(unknown.plans[0]?.serviceCostUsd).toBeNull();
    expect(unknown.blockers).toContain('Provider costs are incomplete.');
    expect(
      evaluatePlanEconomics({
        ...input,
        searchPlan: { ...input.searchPlan, monthlySearches: 5000 },
      }).blockers,
    ).toContain('Shared search capacity is insufficient.');
  });
  it('requires measured evidence and the margin target for every cadence', () => {
    const report = evaluatePlanEconomics({
      ...input,
      costs: {
        perplexityPerCheckUsd: 0.001,
        openaiPerCheckUsd: 0.001,
        classificationPerCheckUsd: 0.00001,
        infrastructurePerAccountUsd: 0.1,
      },
      searchPlan: { ...input.searchPlan, monthlyUsd: 5 },
      evidence: {
        providerRatesVerified: true,
        completeCapturesVerified: true,
        billingLifecycleVerified: true,
      },
    });
    expect(report.ready).toBe(true);
    expect(report.plans.every((p) => p.contribution !== null && p.contribution >= 0.6)).toBe(true);
  });
});

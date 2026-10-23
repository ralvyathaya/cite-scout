import { describe, expect, it } from 'vitest';
import { billingSelectionSchema, legacyPlan, publicPlans, planPrice } from '../../src/shared/plans';
import { billingVariantId, subscriptionPlan } from '../../src/server/billing-plans';

const bindings = {
  LEMON_SQUEEZY_STORE_ID: '1',
  LEMON_SQUEEZY_PRODUCT_ID: '2',
  LEMON_SQUEEZY_VARIANT_ID: '3',
  LEMON_SQUEEZY_TEST_MODE: 'true',
  BILLING_PLAN_VARIANTS: JSON.stringify({
    test: {
      starter: { month: '101', year: '102' },
      growth: { month: '103', year: '104' },
      pro: { month: '105', year: '106' },
    },
    live: {
      starter: { month: '201', year: '202' },
      growth: { month: '203', year: '204' },
      pro: { month: '205', year: '206' },
    },
  }),
};

describe('commercial plan contract', () => {
  it('offers the approved prices, daily capacities and three actual surfaces', () => {
    expect(
      publicPlans.map((p) => [
        p.id,
        p.monthlyPriceUsd,
        p.annualPriceUsd,
        p.promptLimit,
        p.dailyChecks,
      ]),
    ).toEqual([
      ['starter', 29, 290, 5, 15],
      ['growth', 79, 790, 15, 45],
      ['pro', 149, 1490, 30, 90],
    ]);
    for (const plan of publicPlans) {
      expect(plan.engines).toEqual(['perplexity', 'openai_web_search', 'google_aio']);
      expect(planPrice(plan, 'year')).toBe(plan.monthlyPriceUsd * 10);
    }
    expect(legacyPlan.promptLimit).toBe(10);
    expect(legacyPlan.monthlyPriceUsd).toBe(19);
    expect(legacyPlan.engines).toEqual(['perplexity']);
  });
  it('accepts an explicit selection, never a client price or provider variant', () => {
    expect(billingSelectionSchema.safeParse({ planId: 'growth', interval: 'year' }).success).toBe(
      true,
    );
    for (const input of [
      {},
      { planId: 'pro' },
      { planId: 'pro', interval: 'year', price: 1 },
      { planId: 'legacy_perplexity', interval: 'month' },
    ])
      expect(billingSelectionSchema.safeParse(input).success).toBe(false);
  });
  it('maps each cadence only to its configured billing environment', () => {
    expect(billingVariantId(bindings, { planId: 'pro', interval: 'year' })).toBe('106');
    expect(
      billingVariantId(
        { ...bindings, LEMON_SQUEEZY_TEST_MODE: 'false' },
        { planId: 'pro', interval: 'year' },
      ),
    ).toBe('206');
    expect(
      billingVariantId(
        { ...bindings, BILLING_PLAN_VARIANTS: '{}' },
        { planId: 'pro', interval: 'year' },
      ),
    ).toBeNull();
  });
  it('recognizes verified catalog and legacy subscriptions without multiplying annual allowance', () => {
    const sub = {
      lemonSqueezyStoreId: '1',
      lemonSqueezyProductId: '2',
      lemonSqueezyVariantId: '104',
      testMode: true,
    };
    expect(subscriptionPlan(bindings, sub)).toMatchObject({
      id: 'growth',
      interval: 'year',
      dailyChecks: 45,
      promptLimit: 15,
    });
    expect(subscriptionPlan(bindings, { ...sub, lemonSqueezyVariantId: '3' })).toMatchObject({
      id: 'legacy_perplexity',
      interval: 'month',
      dailyChecks: 10,
    });
    expect(subscriptionPlan(bindings, { ...sub, testMode: false })).toBeNull();
    expect(subscriptionPlan(bindings, { ...sub, lemonSqueezyVariantId: '999' })).toBeNull();
    expect(subscriptionPlan(bindings, { ...sub, lemonSqueezyProductId: '99' })).toBeNull();
  });
  it('refuses ambiguous variant mappings', () => {
    expect(() =>
      billingVariantId(
        {
          ...bindings,
          BILLING_PLAN_VARIANTS: JSON.stringify({
            test: { starter: { month: '101' }, pro: { year: '101' } },
          }),
        },
        { planId: 'pro', interval: 'year' },
      ),
    ).toThrow('INVALID_BILLING_PLAN_VARIANTS');
  });
});

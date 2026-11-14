import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { subscriptions } from '../../src/db/schema';
import { LemonSqueezyClient } from '../../src/integrations/lemonsqueezy/client';
import { publicPlans, type BillingSelection, type SubscriptionPlan } from '../../src/shared/plans';
import { syncSubscription } from '../../src/server/billing-sync';
import { getConfig } from '../../src/server/config';
import { billingRoutes } from '../../src/server/routes/billing';
import { billingEnv, cookie, db, seed, subscription } from './fixtures';

const variants = {
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
};
const catalogEnv = {
  ...billingEnv,
  BILLING_PLANS_ENABLED: 'true',
  BILLING_PLAN_VARIANTS: JSON.stringify(variants),
};
const selections = publicPlans.flatMap((plan) =>
  (['month', 'year'] as const).map((interval) => ({ planId: plan.id, interval })),
);
interface BillingStatus {
  data: {
    plan: SubscriptionPlan | null;
    plansEnabled: boolean;
    checkoutAvailable: boolean;
    checkoutOptions: (BillingSelection & { available: boolean })[];
    allowance: { promptLimit: number; dailyChecks: number; monthlyChecks: number } | null;
    entitlement: { canScan: boolean; hasPaidFeatures: boolean };
  };
}
function request(path: string, sessionCookie: string, body?: unknown) {
  return new Request(`https://citescout.test${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Cookie: sessionCookie, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
function canonicalClient(variantId: string, updatedAt = '2026-09-20T00:00:00Z') {
  return new LemonSqueezyClient('test', (input) => {
    const id =
      new URL(input instanceof Request ? input.url : input).pathname.split('/').at(-1) ?? '';
    const remote = subscription(id, 'active', updatedAt);
    remote.attributes.variant_id = Number(variantId);
    return Promise.resolve(Response.json({ data: remote }));
  });
}
function checkoutBody(init: RequestInit | undefined): string {
  if (typeof init?.body !== 'string') throw new Error('EXPECTED_JSON_CHECKOUT_BODY');
  return init.body;
}

describe('verified plan billing', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('UNEXPECTED_NETWORK'));
  });
  afterEach(() => vi.restoreAllMocks());

  it.each(['valid', 'id', 'store', 'product', 'variant', 'mode', 'host', 'protocol'] as const)(
    'validates fresh authenticated portal identity: %s',
    async (change) => {
      const { userId } = await seed(0);
      const id = crypto.randomUUID();
      await syncSubscription(catalogEnv, id, userId, undefined, canonicalClient('101'));
      const remote = subscription(id, 'active', '2026-09-20T00:00:00Z');
      remote.attributes.variant_id = 101;
      if (change === 'id') remote.id = crypto.randomUUID();
      if (change === 'store') remote.attributes.store_id = 999;
      if (change === 'product') remote.attributes.product_id = 999;
      if (change === 'variant') remote.attributes.variant_id = 999;
      if (change === 'mode') remote.attributes.test_mode = false;
      if (change === 'host') remote.attributes.urls.customer_portal = 'https://example.test/portal';
      if (change === 'protocol')
        remote.attributes.urls.customer_portal = 'http://store.lemonsqueezy.com/portal';
      const fetcher = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(Response.json({ data: remote }));
      const response = await billingRoutes.fetch(
        request('/portal', await cookie(userId), {}),
        catalogEnv,
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
      const requested = fetcher.mock.calls[0]?.[0];
      expect(
        requested instanceof Request
          ? requested.url
          : requested instanceof URL
            ? requested.href
            : requested,
      ).toContain(`/subscriptions/${id}`);
      if (change === 'valid') {
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
          data: { url: 'https://store.lemonsqueezy.com/portal' },
        });
      } else {
        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(await response.text()).not.toContain('"url":');
      }
    },
  );

  it('defaults new checkout off and rejects non-boolean activation', () => {
    const withoutCatalog = { ...billingEnv };
    Reflect.deleteProperty(withoutCatalog, 'BILLING_PLANS_ENABLED');
    Reflect.deleteProperty(withoutCatalog, 'BILLING_PLAN_VARIANTS');
    expect(getConfig(withoutCatalog)).toMatchObject({
      BILLING_PLANS_ENABLED: 'false',
      BILLING_PLAN_VARIANTS: '',
    });
    expect(() => getConfig({ ...catalogEnv, BILLING_PLANS_ENABLED: 'yes' })).toThrow();
  });

  it.each(selections)(
    'uses the server variant for $planId $interval checkout',
    async (selection) => {
      const { userId } = await seed(0);
      const sessionCookie = await cookie(userId);
      const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        Response.json({
          data: {
            type: 'checkouts',
            attributes: { url: 'https://store.lemonsqueezy.com/checkout/test' },
          },
        }),
      );
      const response = await billingRoutes.fetch(
        request('/checkout', sessionCookie, selection),
        catalogEnv,
      );
      expect(response.status).toBe(200);
      const init = fetcher.mock.calls[0]?.[1];
      const sent = JSON.parse(checkoutBody(init)) as {
        data: {
          relationships: { variant: { data: { id: string } } };
          attributes: { test_mode: boolean };
        };
      };
      expect(sent.data.relationships.variant.data.id).toBe(
        variants.test[selection.planId][selection.interval],
      );
      expect(sent.data.attributes.test_mode).toBe(true);
      expect(fetcher).toHaveBeenCalledTimes(1);
      const status = await billingRoutes.fetch(request('/status', sessionCookie), catalogEnv);
      expect((await status.json<BillingStatus>()).data.plan).toBeNull();
    },
  );

  it.each([
    {},
    { planId: 'pro' },
    { planId: 'starter', interval: 'week' },
    { planId: 'legacy_perplexity', interval: 'month' },
    { planId: 'pro', interval: 'year', variantId: '101' },
    { planId: 'pro', interval: 'year', price: 1 },
  ])('rejects missing selections and client prices/variants: %j', async (body) => {
    const { userId } = await seed(0);
    const fetcher = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('UNEXPECTED_NETWORK'));
    const response = await billingRoutes.fetch(
      request('/checkout', await cookie(userId), body),
      catalogEnv,
    );
    expect(response.status).toBe(422);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('requires every current-mode variant and credentials before offering any catalog checkout', async () => {
    const { userId } = await seed(0);
    const sessionCookie = await cookie(userId);
    for (const overrides of [
      { BILLING_PLAN_VARIANTS: JSON.stringify({ test: { starter: { month: '101' } } }) },
      { BILLING_PLAN_VARIANTS: '{broken' },
      { BILLING_PLAN_VARIANTS: JSON.stringify({ live: variants.live }) },
      { LEMON_SQUEEZY_WEBHOOK_SECRET: '' },
    ]) {
      const bindings = { ...catalogEnv, ...overrides };
      const status = await billingRoutes.fetch(request('/status', sessionCookie), bindings);
      const { data } = await status.json<BillingStatus>();
      expect(data.checkoutAvailable).toBe(false);
      expect(data.checkoutOptions).toHaveLength(6);
      expect(data.checkoutOptions.every((option) => !option.available)).toBe(true);
      expect(
        (await billingRoutes.fetch(request('/checkout', sessionCookie, selections[0]), bindings))
          .status,
      ).toBe(503);
    }
  });

  it('uses only live-mode mappings for a live checkout', async () => {
    const { userId } = await seed(0);
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        data: {
          type: 'checkouts',
          attributes: { url: 'https://store.lemonsqueezy.com/checkout/test' },
        },
      }),
    );
    const response = await billingRoutes.fetch(
      request('/checkout', await cookie(userId), { planId: 'growth', interval: 'year' }),
      { ...catalogEnv, LEMON_SQUEEZY_TEST_MODE: 'false' },
    );
    expect(response.status).toBe(200);
    expect(checkoutBody(fetcher.mock.calls[0]?.[1])).toContain('"id":"204"');
    expect(checkoutBody(fetcher.mock.calls[0]?.[1])).toContain('"test_mode":false');
  });

  it.each(selections)(
    'recognizes verified $planId $interval and retains daily allowance when checkout is disabled',
    async (selection) => {
      const { userId } = await seed(0);
      const id = crypto.randomUUID();
      await syncSubscription(
        catalogEnv,
        id,
        userId,
        undefined,
        canonicalClient(variants.test[selection.planId][selection.interval]),
      );
      const sessionCookie = await cookie(userId);
      const status = await billingRoutes.fetch(request('/status', sessionCookie), {
        ...catalogEnv,
        BILLING_PLANS_ENABLED: 'false',
      });
      const { data } = await status.json<BillingStatus>();
      const plan = publicPlans.find((value) => value.id === selection.planId);
      expect(data.plan).toMatchObject({ id: selection.planId, interval: selection.interval });
      expect(data.entitlement.canScan).toBe(true);
      expect(data.allowance).toMatchObject({
        promptLimit: plan?.promptLimit,
        dailyChecks: plan?.dailyChecks,
      });
      const now = new Date();
      const days = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
      expect(data.allowance?.monthlyChecks).toBe((plan?.dailyChecks ?? 0) * days);
      expect(data.plansEnabled).toBe(false);
      expect(data.checkoutOptions.every((value) => !value.available)).toBe(true);
      expect(
        (await billingRoutes.fetch(request('/checkout', sessionCookie, selection), catalogEnv))
          .status,
      ).toBe(409);
    },
  );

  it('does not grant live rights to a retained test subscription or unknown variant', async () => {
    const { userId } = await seed(0);
    await syncSubscription(
      catalogEnv,
      crypto.randomUUID(),
      userId,
      undefined,
      canonicalClient('101'),
    );
    const sessionCookie = await cookie(userId);
    const live = await billingRoutes.fetch(request('/status', sessionCookie), {
      ...catalogEnv,
      LEMON_SQUEEZY_TEST_MODE: 'false',
    });
    expect((await live.json<BillingStatus>()).data).toMatchObject({
      plan: null,
      allowance: null,
      entitlement: { canScan: false, hasPaidFeatures: false },
    });
    await db
      .update(subscriptions)
      .set({ lemonSqueezyVariantId: '999' })
      .where(eq(subscriptions.userId, userId));
    const unknown = await billingRoutes.fetch(request('/status', sessionCookie), catalogEnv);
    expect((await unknown.json<BillingStatus>()).data.entitlement.canScan).toBe(false);
  });

  it('applies verified upgrades and downgrades monotonically without deleting subscription history', async () => {
    const { userId } = await seed(0);
    const id = crypto.randomUUID();
    await syncSubscription(catalogEnv, id, userId, undefined, canonicalClient('101'));
    await syncSubscription(
      catalogEnv,
      id,
      userId,
      undefined,
      canonicalClient('106', '2026-09-22T00:00:00Z'),
    );
    await syncSubscription(
      catalogEnv,
      id,
      userId,
      undefined,
      canonicalClient('103', '2026-09-21T00:00:00Z'),
    );
    expect(
      (await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).get())
        ?.lemonSqueezyVariantId,
    ).toBe('106');
    await syncSubscription(
      catalogEnv,
      id,
      userId,
      undefined,
      canonicalClient('102', '2026-09-23T00:00:00Z'),
    );
    expect(
      (await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).get())
        ?.lemonSqueezyVariantId,
    ).toBe('102');
  });

  it('keeps legacy identity and empty legacy checkout while new checkout is disabled', async () => {
    const { userId } = await seed(0);
    const sessionCookie = await cookie(userId);
    const disabled = { ...catalogEnv, BILLING_PLANS_ENABLED: 'false' };
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        data: {
          type: 'checkouts',
          attributes: { url: 'https://store.lemonsqueezy.com/checkout/test' },
        },
      }),
    );
    const response = await billingRoutes.fetch(request('/checkout', sessionCookie, {}), disabled);
    expect(response.status).toBe(200);
    expect(checkoutBody(fetcher.mock.calls[0]?.[1])).toContain('"id":"3"');
    expect(
      (await billingRoutes.fetch(request('/checkout', sessionCookie, selections[0]), disabled))
        .status,
    ).toBe(503);
    await syncSubscription(disabled, crypto.randomUUID(), userId, undefined, canonicalClient('3'));
    const status = await billingRoutes.fetch(request('/status', sessionCookie), disabled);
    expect((await status.json<BillingStatus>()).data.plan).toMatchObject({
      id: 'legacy_perplexity',
      monthlyPriceUsd: 19,
      engines: ['perplexity'],
    });
  });
});

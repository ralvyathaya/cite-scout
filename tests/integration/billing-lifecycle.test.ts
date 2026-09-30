import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { billingWebhookReceipts, subscriptions, users } from '../../src/db/schema';
import {
  LemonSqueezyClient,
  type LemonSubscription,
} from '../../src/integrations/lemonsqueezy/client';
import { syncSubscription } from '../../src/server/billing-sync';
import { deleteAccountData } from '../../src/server/account-deletion';
import { handleLemonWebhook } from '../../src/server/routes/billing';
import { billingEnv, db, seed, subscription } from './fixtures';

function clientFor(values: Map<string, LemonSubscription>) {
  return new LemonSqueezyClient('test', (input) => {
    const id =
      new URL(input instanceof Request ? input.url : String(input)).pathname.split('/').at(-1) ??
      '';
    const value = values.get(id);
    return Promise.resolve(
      Response.json(value ? { data: value } : { error: 'not found' }, {
        status: value ? 200 : 404,
      }),
    );
  });
}
async function signedRequest(payload: unknown) {
  const body = JSON.stringify(payload);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(billingEnv.LEMON_SQUEEZY_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const signature = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return new Request('https://citescout.test/api/webhooks/lemonsqueezy', {
    method: 'POST',
    body,
    headers: { 'X-Signature': signature },
  });
}

describe('verified subscription lifecycle', () => {
  afterEach(() => vi.restoreAllMocks());
  it('keeps canonical updates monotonic and records receipts atomically', async () => {
    const { userId } = await seed(1);
    const id = crypto.randomUUID();
    const values = new Map([[id, subscription(id)]]),
      client = clientFor(values);
    await syncSubscription(
      billingEnv,
      id,
      userId,
      { fingerprint: `${id}-1`, eventName: 'subscription_created' },
      client,
    );
    values.set(id, subscription(id, 'expired', '2026-09-25T00:00:00Z'));
    await syncSubscription(
      billingEnv,
      id,
      userId,
      { fingerprint: `${id}-2`, eventName: 'subscription_expired' },
      client,
    );
    values.set(id, subscription(id, 'active', '2026-09-22T00:00:00Z'));
    await syncSubscription(
      billingEnv,
      id,
      userId,
      { fingerprint: `${id}-3`, eventName: 'subscription_updated' },
      client,
    );
    expect(
      (await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).get())?.status,
    ).toBe('expired');
    expect(
      (
        await db
          .select()
          .from(billingWebhookReceipts)
          .where(eq(billingWebhookReceipts.fingerprint, `${id}-3`))
          .get()
      )?.processedAt,
    ).not.toBeNull();
    const stranger = await seed(1);
    await expect(
      syncSubscription(billingEnv, id, stranger.userId, undefined, client),
    ).rejects.toThrow('BILLING_OWNER_MISMATCH');
  });
  it('replaces ended subscriptions and permanently ignores late events for their old IDs', async () => {
    const { userId } = await seed(1);
    const oldId = crypto.randomUUID(),
      newId = crypto.randomUUID();
    const values = new Map([
      [oldId, subscription(oldId, 'expired', '2026-09-23T00:00:00Z')],
      [newId, subscription(newId, 'active', '2026-09-25T00:00:00Z', '2026-09-24T00:00:00Z')],
    ]);
    const client = clientFor(values);
    await syncSubscription(billingEnv, oldId, userId, undefined, client);
    await syncSubscription(
      billingEnv,
      newId,
      userId,
      { fingerprint: newId, eventName: 'subscription_created' },
      client,
    );
    values.set(oldId, subscription(oldId, 'active', '2026-10-01T00:00:00Z'));
    expect(await syncSubscription(billingEnv, oldId, userId, undefined, client)).toEqual({
      retired: true,
    });
    expect(
      (await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).get())
        ?.lemonSqueezySubscriptionId,
    ).toBe(newId);
  });
  it('refuses replacement of a renewable subscription', async () => {
    const { userId } = await seed(1);
    const oldId = crypto.randomUUID(),
      newId = crypto.randomUUID();
    const client = clientFor(
      new Map([
        [oldId, subscription(oldId)],
        [newId, subscription(newId, 'active', '2026-09-25T00:00:00Z', '2026-09-24T00:00:00Z')],
      ]),
    );
    await syncSubscription(billingEnv, oldId, userId, undefined, client);
    await expect(syncSubscription(billingEnv, newId, userId, undefined, client)).rejects.toThrow(
      'SUBSCRIPTION_REPLACEMENT_REFUSED',
    );
  });
  it.each(['cancelled', 'expired'] as const)(
    'deletes a confirmed %s account and ignores subsequent deliveries',
    async (status) => {
      const { userId } = await seed(1);
      const id = crypto.randomUUID(),
        remote = subscription(id, status);
      if (status === 'cancelled')
        remote.attributes.ends_at = new Date(Date.now() + 86_400_000).toISOString();
      const client = clientFor(new Map([[id, remote]]));
      await syncSubscription(billingEnv, id, userId, undefined, client);
      expect(await deleteAccountData(billingEnv, userId, client)).toBe(true);
      expect(await db.select().from(users).where(eq(users.id, userId)).get()).toBeUndefined();
      expect(
        await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).get(),
      ).toBeUndefined();
      expect(
        await syncSubscription(
          billingEnv,
          id,
          userId,
          { fingerprint: `${id}-late`, eventName: 'subscription_updated' },
          client,
        ),
      ).toEqual({ retired: true });
    },
  );
  it('blocks deletion for renewable or payment-problem subscriptions', async () => {
    const { userId } = await seed(1);
    const id = crypto.randomUUID(),
      values = new Map([[id, subscription(id)]]),
      client = clientFor(values);
    await syncSubscription(billingEnv, id, userId, undefined, client);
    for (const status of ['active', 'paused', 'past_due', 'unpaid'] as const) {
      values.set(id, subscription(id, status));
      await expect(deleteAccountData(billingEnv, userId, client)).rejects.toThrow(
        'ACTIVE_SUBSCRIPTION',
      );
    }
    expect(await db.select().from(users).where(eq(users.id, userId)).get()).toBeDefined();
  });
  it('maps signed invoice events to canonical subscriptions and deduplicates delivery', async () => {
    const { userId } = await seed(1);
    const id = '1234567';
    await syncSubscription(
      billingEnv,
      id,
      userId,
      undefined,
      clientFor(new Map([[id, subscription(id)]])),
    );
    const payload = {
      meta: { event_name: 'subscription_payment_failed' },
      data: {
        type: 'subscription-invoices',
        id: '98765',
        attributes: { store_id: 1, test_mode: true, subscription_id: Number(id) },
      },
    };
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        Response.json({ data: subscription(id, 'past_due', '2026-09-25T00:00:00Z') }),
      );
    expect((await handleLemonWebhook(await signedRequest(payload), billingEnv)).status).toBe(200);
    expect(
      (await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).get())?.status,
    ).toBe('past_due');
    const duplicate = await handleLemonWebhook(await signedRequest(payload), billingEnv);
    expect(await duplicate.json()).toEqual({ data: { duplicate: true } });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('never grants entitlement when canonical verification fails', async () => {
    const { userId } = await seed(1);
    const id = crypto.randomUUID();
    const remote = subscription(id);
    remote.attributes.variant_id = 999;
    await expect(
      syncSubscription(billingEnv, id, userId, undefined, clientFor(new Map([[id, remote]]))),
    ).rejects.toThrow('BILLING_CONFIGURATION_MISMATCH');
    expect(
      await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).get(),
    ).toBeUndefined();
    expect(env.DB).toBeDefined();
  });
});

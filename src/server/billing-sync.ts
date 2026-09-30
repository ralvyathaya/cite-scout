import { getConfig } from './config';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { billingWebhookReceipts, subscriptions, users } from '../db/schema';
import { LemonSqueezyClient, type LemonSubscription } from '../integrations/lemonsqueezy/client';

export function billingConfigured(env: CloudflareBindings): boolean {
  const config = getConfig(env);
  return (
    config.EXTERNAL_INTEGRATIONS_ENABLED === 'true' &&
    Boolean(
      env.LEMON_SQUEEZY_API_KEY &&
      env.LEMON_SQUEEZY_WEBHOOK_SECRET &&
      config.LEMON_SQUEEZY_STORE_ID &&
      config.LEMON_SQUEEZY_PRODUCT_ID &&
      config.LEMON_SQUEEZY_VARIANT_ID &&
      config.LEMON_SQUEEZY_STORE_HOST,
    )
  );
}
export function subscriptionEnded(
  subscription: { status: string; endsAt: Date | null },
  now = new Date(),
): boolean {
  return (
    subscription.status === 'expired' ||
    (subscription.status === 'cancelled' &&
      subscription.endsAt !== null &&
      subscription.endsAt <= now)
  );
}
export function validateSubscription(env: CloudflareBindings, remote: LemonSubscription): void {
  const value = remote.attributes;
  const config = getConfig(env);
  if (
    String(value.store_id) !== env.LEMON_SQUEEZY_STORE_ID ||
    String(value.product_id) !== env.LEMON_SQUEEZY_PRODUCT_ID ||
    String(value.variant_id) !== env.LEMON_SQUEEZY_VARIANT_ID ||
    value.test_mode !== (config.LEMON_SQUEEZY_TEST_MODE === 'true')
  )
    throw new Error('BILLING_CONFIGURATION_MISMATCH');
}
export function retirementStatement(
  binding: D1Database,
  id: string,
  now: Date,
): D1PreparedStatement {
  return binding
    .prepare(
      `INSERT OR IGNORE INTO billing_webhook_receipts
    (fingerprint,provider,event_name,resource_type,resource_id,received_at,processed_at)
    VALUES (?,'lemonsqueezy','subscription_retired','subscriptions',?,?,?)`,
    )
    .bind(`retired:${id}`, id, now.getTime(), now.getTime());
}
interface Receipt {
  fingerprint: string;
  eventName: string;
}

/** Canonical provider state is the only input to entitlement updates, including invoice events. */
export async function syncSubscription(
  env: CloudflareBindings,
  id: string,
  ownerId?: string,
  receipt?: Receipt,
  client = new LemonSqueezyClient(env.LEMON_SQUEEZY_API_KEY),
) {
  const db = drizzle(env.DB);
  const now = new Date();
  const retired = await db
    .select()
    .from(billingWebhookReceipts)
    .where(eq(billingWebhookReceipts.fingerprint, `retired:${id}`))
    .get();
  const receiptValues = receipt
    ? {
        fingerprint: receipt.fingerprint,
        eventName: receipt.eventName,
        resourceType: 'subscriptions',
        resourceId: id,
        receivedAt: now,
        processedAt: now,
      }
    : null;
  if (retired) {
    if (receiptValues)
      await db.insert(billingWebhookReceipts).values(receiptValues).onConflictDoNothing();
    return { retired: true };
  }
  const remote = await client.getSubscription(id);
  if (remote.id !== id) throw new Error('BILLING_ID_MISMATCH');
  validateSubscription(env, remote);
  const existing = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.lemonSqueezySubscriptionId, id))
    .get();
  if (existing && ownerId && existing.userId !== ownerId) throw new Error('BILLING_OWNER_MISMATCH');
  const userId = existing?.userId ?? ownerId;
  if (!userId) throw new Error('MISSING_OWNER');
  const user = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) {
    await env.DB.batch([
      retirementStatement(env.DB, id, now),
      ...(receiptValues
        ? [
            (() => {
              const q = db
                .insert(billingWebhookReceipts)
                .values(receiptValues)
                .onConflictDoNothing()
                .toSQL();
              return env.DB.prepare(q.sql).bind(...q.params);
            })(),
          ]
        : []),
    ]);
    return { retired: true };
  }
  const current =
    existing ??
    (await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).get());
  if (current && current.lemonSqueezySubscriptionId !== id) {
    const seen = await db
      .select()
      .from(billingWebhookReceipts)
      .where(
        and(
          eq(billingWebhookReceipts.resourceId, id),
          eq(billingWebhookReceipts.resourceType, 'subscriptions'),
          sql`${billingWebhookReceipts.processedAt} IS NOT NULL`,
        ),
      )
      .get();
    if (seen) {
      await env.DB.batch([retirementStatement(env.DB, id, now)]);
      return { retired: true };
    }
    const oldRemote = await client.getSubscription(current.lemonSqueezySubscriptionId);
    validateSubscription(env, oldRemote);
    if (
      !subscriptionEnded(
        {
          status: oldRemote.attributes.status,
          endsAt: oldRemote.attributes.ends_at ? new Date(oldRemote.attributes.ends_at) : null,
        },
        now,
      ) ||
      new Date(remote.attributes.created_at) <= new Date(oldRemote.attributes.created_at)
    )
      throw new Error('SUBSCRIPTION_REPLACEMENT_REFUSED');
  }
  const value = remote.attributes;
  const values = {
    lemonSqueezySubscriptionId: id,
    lemonSqueezyCustomerId: String(value.customer_id),
    lemonSqueezyOrderId: value.order_id === null ? null : String(value.order_id),
    lemonSqueezyStoreId: String(value.store_id),
    lemonSqueezyProductId: String(value.product_id),
    lemonSqueezyVariantId: String(value.variant_id),
    status: value.status,
    cancelled: value.cancelled,
    renewsAt: value.renews_at ? new Date(value.renews_at) : null,
    endsAt: value.ends_at ? new Date(value.ends_at) : null,
    trialEndsAt: value.trial_ends_at ? new Date(value.trial_ends_at) : null,
    paymentProcessor: value.payment_processor,
    cardBrand: value.card_brand,
    cardLastFour: value.card_last_four,
    testMode: value.test_mode,
    providerUpdatedAt: new Date(value.updated_at),
    updatedAt: now,
  };
  const unchanged = current?.lemonSqueezySubscriptionId === id;
  const write = current
    ? db
        .update(subscriptions)
        .set(values)
        .where(
          and(
            eq(subscriptions.id, current.id),
            eq(subscriptions.userId, userId),
            eq(subscriptions.lemonSqueezySubscriptionId, current.lemonSqueezySubscriptionId),
            unchanged
              ? sql`(${subscriptions.providerUpdatedAt} IS NULL OR ${subscriptions.providerUpdatedAt} < ${values.providerUpdatedAt.getTime()})`
              : sql`${subscriptions.updatedAt} = ${current.updatedAt.getTime()}`,
            sql`NOT EXISTS (SELECT 1 FROM billing_webhook_receipts WHERE fingerprint = ${`retired:${id}`})`,
          ),
        )
        .toSQL()
    : db
        .insert(subscriptions)
        .values({ id: crypto.randomUUID(), userId, ...values, createdAt: now })
        .onConflictDoNothing()
        .toSQL();
  const statements = [env.DB.prepare(write.sql).bind(...write.params)];
  if (current && !unchanged)
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO billing_webhook_receipts
    (fingerprint,provider,event_name,resource_type,resource_id,received_at,processed_at)
    SELECT ?,'lemonsqueezy','subscription_retired','subscriptions',?,?,?
    WHERE EXISTS (SELECT 1 FROM subscriptions WHERE user_id = ? AND lemon_squeezy_subscription_id = ?)`,
      ).bind(
        `retired:${current.lemonSqueezySubscriptionId}`,
        current.lemonSqueezySubscriptionId,
        now.getTime(),
        now.getTime(),
        userId,
        id,
      ),
    );
  if (receipt)
    statements.push(
      env.DB.prepare(
        `INSERT INTO billing_webhook_receipts
    (fingerprint,provider,event_name,resource_type,resource_id,received_at,processed_at)
    SELECT ?,'lemonsqueezy',?,'subscriptions',?,?,?
    WHERE EXISTS (SELECT 1 FROM subscriptions WHERE user_id = ? AND lemon_squeezy_subscription_id = ? AND provider_updated_at >= ?)
    ON CONFLICT(fingerprint) DO UPDATE SET processed_at = excluded.processed_at, resource_id = excluded.resource_id, resource_type = 'subscriptions'`,
      ).bind(
        receipt.fingerprint,
        receipt.eventName,
        id,
        now.getTime(),
        now.getTime(),
        userId,
        id,
        values.providerUpdatedAt.getTime(),
      ),
    );
  statements.push(
    env.DB.prepare(
      `SELECT id FROM subscriptions WHERE user_id = ? AND lemon_squeezy_subscription_id = ? AND provider_updated_at >= ?`,
    ).bind(userId, id, values.providerUpdatedAt.getTime()),
  );
  const results = await env.DB.batch(statements);
  if (!results.at(-1)?.results.length) throw new Error('BILLING_SYNC_CONFLICT');
  return { retired: false };
}

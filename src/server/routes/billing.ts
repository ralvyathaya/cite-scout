import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { billingWebhookReceipts, subscriptions, users } from '../../db/schema';
import { getEntitlement } from '../../domain/entitlements';
import { safeRedirect } from '../../domain/redirects';
import { LemonSqueezyClient } from '../../integrations/lemonsqueezy/client';
import {
  lemonWebhookSchema,
  sha256,
  verifyWebhookSignature,
} from '../../integrations/lemonsqueezy/webhook';
import { createAuth } from '../auth';
import { getConfig } from '../config';
import { requireSession } from '../http';

export const billingRoutes = new Hono<{ Bindings: CloudflareBindings }>();

billingRoutes.get('/status', async (c) => {
  const session = await requireSession(c, createAuth(c.env));
  if (!session)
    return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } }, 401);
  const db = drizzle(c.env.DB);
  const subscription = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, session.user.id))
    .get();
  return c.json({
    data: {
      subscription: subscription ?? null,
      entitlement: getEntitlement(
        subscription ? { status: subscription.status, endsAt: subscription.endsAt } : null,
        new Date(),
      ),
    },
  });
});

billingRoutes.post('/checkout', async (c) => {
  const config = getConfig(c.env);
  const session = await requireSession(c, createAuth(c.env));
  if (!session)
    return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } }, 401);
  if (config.EXTERNAL_INTEGRATIONS_ENABLED !== 'true')
    return c.json(
      {
        error: {
          code: 'INTEGRATION_DISABLED',
          message: 'Checkout is unavailable in local development.',
        },
      },
      503,
    );
  const db = drizzle(c.env.DB);
  const current = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, session.user.id))
    .get();
  if (
    getEntitlement(current ? { status: current.status, endsAt: current.endsAt } : null, new Date())
      .canScan
  )
    return c.json(
      {
        error: {
          code: 'ALREADY_SUBSCRIBED',
          message: 'Your subscription already includes monitoring.',
        },
      },
      409,
    );
  const client = new LemonSqueezyClient(c.env.LEMON_SQUEEZY_API_KEY);
  const url = await client.createCheckout({
    storeId: c.env.LEMON_SQUEEZY_STORE_ID,
    variantId: c.env.LEMON_SQUEEZY_VARIANT_ID,
    email: session.user.email,
    userId: session.user.id,
    redirectUrl: safeRedirect('/app/billing?checkout=complete', c.env.APP_URL),
  });
  return c.json({ data: { url } });
});

billingRoutes.post('/portal', async (c) => {
  const config = getConfig(c.env);
  const session = await requireSession(c, createAuth(c.env));
  if (!session)
    return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } }, 401);
  const db = drizzle(c.env.DB);
  const owned = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, session.user.id))
    .get();
  if (!owned)
    return c.json(
      { error: { code: 'NO_SUBSCRIPTION', message: 'No subscription is linked to this account.' } },
      404,
    );
  const fresh = await new LemonSqueezyClient(c.env.LEMON_SQUEEZY_API_KEY).getSubscription(
    owned.lemonSqueezySubscriptionId,
  );
  const portal = new URL(fresh.attributes.urls.customer_portal);
  if (
    portal.protocol !== 'https:' ||
    (config.LEMON_SQUEEZY_STORE_HOST && portal.hostname !== config.LEMON_SQUEEZY_STORE_HOST)
  )
    return c.json(
      { error: { code: 'INVALID_PORTAL_URL', message: 'Billing portal validation failed.' } },
      502,
    );
  return c.json({ data: { url: portal.toString() } });
});

export async function handleLemonWebhook(
  request: Request,
  env: CloudflareBindings,
): Promise<Response> {
  const config = getConfig(env);
  const raw = await request.arrayBuffer();
  if (raw.byteLength > 1_000_000)
    return Response.json(
      { error: { code: 'BODY_TOO_LARGE', message: 'Webhook body is too large.' } },
      { status: 413 },
    );
  if (
    !(await verifyWebhookSignature(
      raw,
      request.headers.get('X-Signature'),
      env.LEMON_SQUEEZY_WEBHOOK_SECRET,
    ))
  )
    return Response.json(
      { error: { code: 'INVALID_SIGNATURE', message: 'Invalid webhook signature.' } },
      { status: 401 },
    );
  const parsed = lemonWebhookSchema.safeParse(JSON.parse(new TextDecoder().decode(raw)));
  if (!parsed.success)
    return Response.json(
      { error: { code: 'INVALID_PAYLOAD', message: 'Invalid webhook payload.' } },
      { status: 422 },
    );
  const event = parsed.data;
  const expectedTest = config.LEMON_SQUEEZY_TEST_MODE === 'true';
  if (
    String(event.data.attributes.store_id) !== env.LEMON_SQUEEZY_STORE_ID ||
    event.data.attributes.test_mode !== expectedTest
  )
    return Response.json(
      {
        error: {
          code: 'BILLING_CONFIGURATION_MISMATCH',
          message: 'Webhook does not match this environment.',
        },
      },
      { status: 422 },
    );
  const isSubscription = event.data.type === 'subscriptions';
  if (
    isSubscription &&
    (String(event.data.attributes.product_id) !== env.LEMON_SQUEEZY_PRODUCT_ID ||
      String(event.data.attributes.variant_id) !== env.LEMON_SQUEEZY_VARIANT_ID)
  )
    return Response.json(
      {
        error: { code: 'BILLING_PRODUCT_MISMATCH', message: 'Webhook product is not configured.' },
      },
      { status: 422 },
    );
  const fingerprint = await sha256(raw);
  const db = drizzle(env.DB);
  const now = new Date();
  const claim = await db
    .insert(billingWebhookReceipts)
    .values({
      fingerprint,
      eventName: event.meta.event_name,
      resourceType: event.data.type,
      resourceId: event.data.id,
      receivedAt: now,
    })
    .onConflictDoNothing()
    .returning({ fingerprint: billingWebhookReceipts.fingerprint });
  if (claim.length === 0) {
    const receipt = await db
      .select({ processedAt: billingWebhookReceipts.processedAt })
      .from(billingWebhookReceipts)
      .where(eq(billingWebhookReceipts.fingerprint, fingerprint))
      .get();
    if (receipt?.processedAt) return Response.json({ data: { duplicate: true } });
    // Continue an earlier verified delivery that claimed the fingerprint but did not complete.
  }
  if (isSubscription) {
    const attributes = event.data.attributes;
    const full = zSubscription(attributes);
    const owner = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.lemonSqueezySubscriptionId, event.data.id))
      .get();
    if (!owner) {
      const userId = event.meta.custom_data?.user_id;
      if (!userId)
        return Response.json(
          { error: { code: 'MISSING_OWNER', message: 'Subscription owner is missing.' } },
          { status: 422 },
        );
      const user = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).get();
      if (!user)
        return Response.json(
          { error: { code: 'UNKNOWN_OWNER', message: 'Subscription owner does not exist.' } },
          { status: 422 },
        );
      await db.insert(subscriptions).values({
        id: crypto.randomUUID(),
        userId,
        lemonSqueezySubscriptionId: event.data.id,
        ...full,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await db
        .update(subscriptions)
        .set({ ...full, updatedAt: now })
        .where(eq(subscriptions.id, owner.id));
    }
  }
  await db
    .update(billingWebhookReceipts)
    .set({ processedAt: new Date() })
    .where(eq(billingWebhookReceipts.fingerprint, fingerprint));
  return Response.json({ data: { processed: true } });
}

function zSubscription(attributes: Record<string, unknown>) {
  const schema = z.object({
    customer_id: z.number(),
    order_id: z.number().nullable(),
    store_id: z.number(),
    product_id: z.number(),
    variant_id: z.number(),
    status: z.enum(['on_trial', 'active', 'paused', 'past_due', 'unpaid', 'cancelled', 'expired']),
    cancelled: z.boolean(),
    renews_at: z.string().nullable(),
    ends_at: z.string().nullable(),
    trial_ends_at: z.string().nullable(),
    payment_processor: z.string().nullable(),
    card_brand: z.string().nullable(),
    card_last_four: z.string().nullable(),
    test_mode: z.boolean(),
    updated_at: z.string(),
  });
  const value = schema.parse(attributes);
  return {
    lemonSqueezyCustomerId: String(value.customer_id),
    lemonSqueezyOrderId: value.order_id ? String(value.order_id) : null,
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
  };
}

import { z } from 'zod';

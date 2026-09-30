import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { billingWebhookReceipts, subscriptions } from '../../db/schema';
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
import { billingConfigured, subscriptionEnded, syncSubscription } from '../billing-sync';
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
      checkoutAvailable:
        billingConfigured(c.env) && (!subscription || subscriptionEnded(subscription)),
      portalAvailable: billingConfigured(c.env) && Boolean(subscription),
      availabilityMessage: billingConfigured(c.env)
        ? null
        : 'Billing is not available yet. Contact support@cite-scout.com for help.',
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
  if (!billingConfigured(c.env))
    return c.json(
      {
        error: {
          code: 'INTEGRATION_DISABLED',
          message: 'Checkout is not configured yet. Contact support@cite-scout.com for help.',
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
  if (current && !subscriptionEnded(current))
    return c.json(
      {
        error: {
          code: 'ALREADY_SUBSCRIBED',
          message: 'Manage your existing subscription in the billing portal.',
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
    testMode: config.LEMON_SQUEEZY_TEST_MODE === 'true',
    redirectUrl: safeRedirect('/app/billing?checkout=complete', c.env.APP_URL),
  });
  return c.json({ data: { url } });
});

billingRoutes.post('/portal', async (c) => {
  const config = getConfig(c.env);
  const session = await requireSession(c, createAuth(c.env));
  if (!session)
    return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } }, 401);
  if (!billingConfigured(c.env))
    return c.json(
      { error: { code: 'BILLING_UNAVAILABLE', message: 'Billing is not available yet.' } },
      503,
    );
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
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw)) as unknown;
  } catch {
    return Response.json(
      { error: { code: 'INVALID_PAYLOAD', message: 'Invalid webhook payload.' } },
      { status: 422 },
    );
  }
  const parsed = lemonWebhookSchema.safeParse(payload);
  if (!parsed.success)
    return Response.json(
      { error: { code: 'INVALID_PAYLOAD', message: 'Invalid webhook payload.' } },
      { status: 422 },
    );
  const event = parsed.data;
  if (
    String(event.data.attributes.store_id) !== env.LEMON_SQUEEZY_STORE_ID ||
    event.data.attributes.test_mode !== (config.LEMON_SQUEEZY_TEST_MODE === 'true')
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
  const payment = event.meta.event_name.startsWith('subscription_payment_');
  if (
    payment
      ? event.data.type !== 'subscription-invoices' || !event.data.attributes.subscription_id
      : event.data.type !== 'subscriptions'
  )
    return Response.json(
      {
        error: { code: 'INVALID_PAYLOAD', message: 'Webhook resource does not match event type.' },
      },
      { status: 422 },
    );
  const id = payment ? String(event.data.attributes.subscription_id) : event.data.id;
  const fingerprint = await sha256(raw);
  const receipt = await drizzle(env.DB)
    .select()
    .from(billingWebhookReceipts)
    .where(eq(billingWebhookReceipts.fingerprint, fingerprint))
    .get();
  if (receipt?.processedAt) return Response.json({ data: { duplicate: true } });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await syncSubscription(env, id, event.meta.custom_data?.user_id, {
        fingerprint,
        eventName: event.meta.event_name,
      });
      return Response.json({ data: { processed: true, ...result } });
    } catch (error) {
      const code = error instanceof Error ? error.message : 'BILLING_SYNC_FAILED';
      if (code === 'BILLING_SYNC_CONFLICT' && attempt === 0) continue;
      const rejected = [
        'BILLING_CONFIGURATION_MISMATCH',
        'BILLING_ID_MISMATCH',
        'BILLING_OWNER_MISMATCH',
        'MISSING_OWNER',
        'SUBSCRIPTION_REPLACEMENT_REFUSED',
      ].includes(code);
      return Response.json(
        {
          error: {
            code: rejected ? code : 'BILLING_SYNC_FAILED',
            message: rejected
              ? 'Subscription verification was rejected.'
              : 'Subscription verification is temporarily unavailable.',
          },
        },
        { status: rejected ? 422 : 503 },
      );
    }
  }
  return Response.json({ error: { code: 'BILLING_SYNC_FAILED' } }, { status: 503 });
}

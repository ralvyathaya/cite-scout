import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { z } from 'zod';
import { billingSelectionSchema, monthlyCheckLimit, publicPlans } from '../../shared/plans';
import { recordPayment } from '../v2/payments';
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
import {
  billingConfigured,
  subscriptionEnded,
  syncSubscription,
  validateSubscription,
} from '../billing-sync';
import { billingCatalogConfigured, billingVariantId, subscriptionPlan } from '../billing-plans';
import { readJson, requireSession } from '../http';

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
  const config = getConfig(c.env);
  const plan = subscriptionPlan(config, subscription ?? null);
  const configured = billingConfigured(c.env);
  const plansEnabled = config.BILLING_PLANS_ENABLED === 'true';
  const ready =
    configured &&
    (plansEnabled ? billingCatalogConfigured(config) : Boolean(config.LEMON_SQUEEZY_VARIANT_ID));
  const checkoutAvailable = ready && (!subscription || subscriptionEnded(subscription));
  const now = new Date();
  return c.json({
    data: {
      subscription: subscription ?? null,
      plan,
      plansEnabled,
      checkoutOptions: publicPlans.flatMap((value) =>
        (['month', 'year'] as const).map((interval) => ({
          planId: value.id,
          interval,
          available: plansEnabled && checkoutAvailable,
        })),
      ),
      allowance: plan
        ? {
            promptLimit: plan.promptLimit,
            dailyChecks: plan.dailyChecks,
            monthlyChecks: monthlyCheckLimit(plan, now),
          }
        : null,
      checkoutAvailable,
      portalAvailable: configured && Boolean(plan),
      availabilityMessage: ready
        ? null
        : 'Billing is not available yet. Contact support@cite-scout.com for help.',
      entitlement: getEntitlement(
        subscription && plan ? { status: subscription.status, endsAt: subscription.endsAt } : null,
        now,
      ),
    },
  });
});

billingRoutes.post('/checkout', async (c) => {
  const config = getConfig(c.env);
  const session = await requireSession(c, createAuth(c.env));
  if (!session)
    return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } }, 401);
  const plansEnabled = config.BILLING_PLANS_ENABLED === 'true';
  if (!billingConfigured(c.env) || (plansEnabled && !billingCatalogConfigured(config)))
    return c.json(
      {
        error: {
          code: 'INTEGRATION_DISABLED',
          message: 'Checkout is not configured yet. Contact support@cite-scout.com for help.',
        },
      },
      503,
    );
  const payload = c.req.raw.body === null ? {} : await readJson(c.req.raw, 1024);
  const selection = billingSelectionSchema.safeParse(payload);
  if (!plansEnabled && selection.success)
    return c.json(
      {
        error: {
          code: 'INTEGRATION_DISABLED',
          message: 'These plans are not available for checkout yet.',
        },
      },
      503,
    );
  if (plansEnabled ? !selection.success : !z.object({}).strict().safeParse(payload).success)
    return c.json(
      {
        error: {
          code: 'INVALID_SELECTION',
          message: 'Choose a plan and billing interval to continue.',
        },
      },
      422,
    );
  const variantId =
    plansEnabled && selection.success
      ? billingVariantId(config, selection.data)
      : config.LEMON_SQUEEZY_VARIANT_ID;
  if (!variantId)
    return c.json(
      { error: { code: 'INTEGRATION_DISABLED', message: 'Checkout is not available yet.' } },
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
    variantId,
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
  if (fresh.id !== owned.lemonSqueezySubscriptionId)
    return c.json(
      { error: { code: 'BILLING_ID_MISMATCH', message: 'Billing portal validation failed.' } },
      502,
    );
  validateSubscription(c.env, fresh);
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
  if (receipt?.processedAt) {
    if (payment) await recordPayment(env, id, event.data.id, event.data.attributes, fingerprint);
    return Response.json({ data: { duplicate: true } });
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await syncSubscription(env, id, event.meta.custom_data?.user_id, {
        fingerprint,
        eventName: event.meta.event_name,
      });
      if (payment && !result.retired)
        await recordPayment(env, id, event.data.id, event.data.attributes, fingerprint);
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

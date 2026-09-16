import { eq, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { z } from 'zod';
import { subscriptions } from '../../db/schema';
import { LemonSqueezyClient } from '../../integrations/lemonsqueezy/client';
import { readJsonLimited } from '../http';
import { getConfig } from '../config';

const inputSchema = z
  .object({ userId: z.string().min(1).optional(), subscriptionId: z.string().min(1).optional() })
  .refine((value) => Boolean(value.userId ?? value.subscriptionId));
export const operatorRoutes = new Hono<{ Bindings: CloudflareBindings }>();
operatorRoutes.post('/billing/reconcile', async (c) => {
  const config = getConfig(c.env);
  const authorization = c.req.header('Authorization');
  if (!authorization?.startsWith('Bearer ') || !config.OPERATOR_SECRET)
    return c.json(
      { error: { code: 'UNAUTHORIZED', message: 'Invalid operator credential.' } },
      401,
    );
  const provided = authorization.slice(7);
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(provided)),
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(config.OPERATOR_SECRET)),
  ]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1)
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  if (difference !== 0)
    return c.json(
      { error: { code: 'UNAUTHORIZED', message: 'Invalid operator credential.' } },
      401,
    );
  const parsed = inputSchema.safeParse(await readJsonLimited(c.req.raw));
  if (!parsed.success)
    return c.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Provide a user or subscription ID.' } },
      422,
    );
  const db = drizzle(c.env.DB);
  const local = await db
    .select()
    .from(subscriptions)
    .where(
      or(
        parsed.data.userId ? eq(subscriptions.userId, parsed.data.userId) : undefined,
        parsed.data.subscriptionId
          ? eq(subscriptions.lemonSqueezySubscriptionId, parsed.data.subscriptionId)
          : undefined,
      ),
    )
    .get();
  if (!local)
    return c.json({ error: { code: 'NOT_FOUND', message: 'Subscription was not found.' } }, 404);
  const remote = await new LemonSqueezyClient(c.env.LEMON_SQUEEZY_API_KEY).getSubscription(
    local.lemonSqueezySubscriptionId,
  );
  if (
    String(remote.attributes.store_id) !== c.env.LEMON_SQUEEZY_STORE_ID ||
    String(remote.attributes.product_id) !== c.env.LEMON_SQUEEZY_PRODUCT_ID ||
    String(remote.attributes.variant_id) !== c.env.LEMON_SQUEEZY_VARIANT_ID ||
    remote.attributes.test_mode !== (config.LEMON_SQUEEZY_TEST_MODE === 'true')
  )
    return c.json(
      {
        error: {
          code: 'BILLING_CONFIGURATION_MISMATCH',
          message: 'Provider subscription does not match configuration.',
        },
      },
      422,
    );
  await db
    .update(subscriptions)
    .set({
      status: remote.attributes.status,
      cancelled: remote.attributes.cancelled,
      renewsAt: remote.attributes.renews_at ? new Date(remote.attributes.renews_at) : null,
      endsAt: remote.attributes.ends_at ? new Date(remote.attributes.ends_at) : null,
      providerUpdatedAt: new Date(remote.attributes.updated_at),
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, local.id));
  return c.json({ data: { reconciled: true, subscriptionId: local.lemonSqueezySubscriptionId } });
});

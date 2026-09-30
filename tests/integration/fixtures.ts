import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { serializeSignedCookie } from 'better-call';
import { users, projects, prompts, sessions, subscriptions } from '../../src/db/schema';
import type { ObservationProvider } from '../../src/integrations/perplexity/provider';
import type { LemonSubscription } from '../../src/integrations/lemonsqueezy/client';

export const db = drizzle(env.DB);
export const provider: ObservationProvider = {
  runObservation: () =>
    Promise.resolve({
      text: 'Calendly is a strong choice. OrbitCal exists.',
      citations: [{ id: 1, url: 'https://reddit.com/r/tools' }],
      providerRequestId: 'test',
      model: 'test',
      preset: 'fast',
      inputTokens: 2,
      outputTokens: 2,
    }),
};
export async function seed(count = 3, paid = false, at = new Date()) {
  const userId = crypto.randomUUID(),
    projectId = crypto.randomUUID();
  await db.insert(users).values({
    id: userId,
    name: 'Test',
    email: `${userId}@example.test`,
    emailVerified: true,
    createdAt: at,
    updatedAt: at,
  });
  await db.insert(projects).values({
    id: projectId,
    userId,
    name: 'Test',
    brandName: 'OrbitCal',
    canonicalDomain: 'orbitcal.test',
    createdAt: at,
    updatedAt: at,
  });
  const promptIds: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const id = crypto.randomUUID();
    promptIds.push(id);
    await db.insert(prompts).values({
      id,
      projectId,
      text: `Best scheduling tool number ${String(i)}`,
      normalizedText: `best scheduling tool number ${String(i)}`,
      enabled: true,
      createdAt: at,
      updatedAt: at,
    });
  }
  if (paid)
    await db.insert(subscriptions).values({
      id: crypto.randomUUID(),
      userId,
      lemonSqueezySubscriptionId: crypto.randomUUID(),
      lemonSqueezyCustomerId: '1',
      lemonSqueezyStoreId: '1',
      lemonSqueezyProductId: '2',
      lemonSqueezyVariantId: '3',
      status: 'active',
      testMode: true,
      createdAt: at,
      updatedAt: at,
    });
  return { userId, projectId, promptIds };
}
export async function cookie(userId: string, createdAt = new Date()): Promise<string> {
  const token = crypto.randomUUID();
  await db.insert(sessions).values({
    id: crypto.randomUUID(),
    userId,
    token,
    createdAt,
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  return (
    (await serializeSignedCookie('better-auth.session_token', token, env.BETTER_AUTH_SECRET)).split(
      ';',
    )[0] ?? ''
  );
}
// Wrangler generates literal types for configured vars; tests exercise alternate configurations.
export function withBindings(overrides: Record<string, string>): CloudflareBindings {
  const bindings = { ...env };
  for (const [key, value] of Object.entries(overrides)) Reflect.set(bindings, key, value);
  return bindings;
}
export const billingEnv = withBindings({
  LEMON_SQUEEZY_STORE_ID: '1',
  LEMON_SQUEEZY_PRODUCT_ID: '2',
  LEMON_SQUEEZY_VARIANT_ID: '3',
  LEMON_SQUEEZY_TEST_MODE: 'true',
  LEMON_SQUEEZY_API_KEY: 'test',
  LEMON_SQUEEZY_WEBHOOK_SECRET: 'test-webhook',
  LEMON_SQUEEZY_STORE_HOST: 'store.lemonsqueezy.com',
  EXTERNAL_INTEGRATIONS_ENABLED: 'true',
});
export function subscription(
  id: string,
  status: LemonSubscription['attributes']['status'] = 'active',
  updatedAt = '2026-09-20T00:00:00Z',
  createdAt = '2026-09-01T00:00:00Z',
): LemonSubscription {
  return {
    id,
    type: 'subscriptions',
    attributes: {
      store_id: 1,
      customer_id: 1,
      order_id: 1,
      product_id: 2,
      variant_id: 3,
      status,
      cancelled: status === 'cancelled',
      renews_at: null,
      ends_at: status === 'expired' ? '2026-09-21T00:00:00Z' : null,
      trial_ends_at: null,
      payment_processor: null,
      card_brand: null,
      card_last_four: null,
      test_mode: true,
      created_at: createdAt,
      updated_at: updatedAt,
      urls: { customer_portal: 'https://store.lemonsqueezy.com/portal' },
    },
  };
}

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { subscriptions } from '../db/schema';
import { LemonSqueezyClient } from '../integrations/lemonsqueezy/client';
import { validateSubscription } from './billing-sync';

export async function deleteAccountData(
  env: CloudflareBindings,
  userId: string,
  client = new LemonSqueezyClient(env.LEMON_SQUEEZY_API_KEY),
): Promise<boolean> {
  const current = await drizzle(env.DB)
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .get();
  const statements: D1PreparedStatement[] = [];
  if (current) {
    const remote = await client.getSubscription(current.lemonSqueezySubscriptionId);
    if (remote.id !== current.lemonSqueezySubscriptionId) throw new Error('BILLING_ID_MISMATCH');
    validateSubscription(env, remote);
    if (!['cancelled', 'expired'].includes(remote.attributes.status))
      throw new Error('ACTIVE_SUBSCRIPTION');
    const now = Date.now();
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO billing_webhook_receipts
      (fingerprint,provider,event_name,resource_type,resource_id,received_at,processed_at)
      SELECT ?,'lemonsqueezy','subscription_retired','subscriptions',?,?,?
      WHERE EXISTS (SELECT 1 FROM subscriptions WHERE id = ? AND user_id = ? AND updated_at = ?)`,
      ).bind(
        `retired:${remote.id}`,
        remote.id,
        now,
        now,
        current.id,
        userId,
        current.updatedAt.getTime(),
      ),
    );
    statements.push(
      env.DB.prepare(
        `DELETE FROM subscriptions WHERE id = ? AND user_id = ? AND updated_at = ?
      AND EXISTS (SELECT 1 FROM billing_webhook_receipts WHERE fingerprint = ?)`,
      ).bind(current.id, userId, current.updatedAt.getTime(), `retired:${remote.id}`),
    );
  }
  statements.push(
    env.DB.prepare(
      'DELETE FROM users WHERE id = ? AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE user_id = ?)',
    ).bind(userId, userId),
  );
  const results = await env.DB.batch(statements);
  return (results.at(-1)?.meta.changes ?? 0) > 0;
}

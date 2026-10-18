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
  // Reservations keep anonymous cost counts; deletion also revokes in-flight evidence writes.
  statements.push(
    env.DB.prepare(
      `UPDATE onboarding_suggestions SET draft_json=NULL,source_key='REDACTED',
      state=CASE WHEN state='reserved' THEN 'failed' ELSE state END,
      error_code=CASE WHEN state='reserved' THEN 'ACCOUNT_DELETED' ELSE error_code END
      WHERE user_id=? AND NOT EXISTS(SELECT 1 FROM subscriptions WHERE user_id=?)`,
    ).bind(userId, userId),
  );
  statements.push(
    env.DB.prepare(
      `UPDATE geo_processing_attempts SET input_json='{}',result_json=NULL,input_hash='REDACTED',lease_token=NULL,lease_until=NULL,
      state=CASE WHEN state IN ('queued','running') THEN 'failed' ELSE state END,
      failure_code=CASE WHEN state IN ('queued','running') THEN 'ACCOUNT_DELETED' ELSE failure_code END
      WHERE project_id IN (SELECT id FROM projects WHERE user_id=?) AND NOT EXISTS(SELECT 1 FROM subscriptions WHERE user_id=?)`,
    ).bind(userId, userId),
  );
  statements.push(
    env.DB.prepare(
      `UPDATE provider_call_reservations SET
    request_context_json=NULL,provider_response_json=NULL,item_id=NULL,lease_token=NULL,lease_until=NULL,
    status=CASE WHEN status='reserved' THEN 'failed' ELSE status END,
    failure_code=CASE WHEN status='reserved' THEN 'ACCOUNT_DELETED' ELSE failure_code END
    WHERE user_id=? AND NOT EXISTS(SELECT 1 FROM subscriptions WHERE user_id=?)`,
    ).bind(userId, userId),
  );
  statements.push(
    env.DB.prepare(
      'DELETE FROM users WHERE id = ? AND NOT EXISTS (SELECT 1 FROM subscriptions WHERE user_id = ?)',
    ).bind(userId, userId),
  );
  const results = await env.DB.batch(statements);
  return (results.at(-1)?.meta.changes ?? 0) > 0;
}

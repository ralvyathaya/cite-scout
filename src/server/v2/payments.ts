import { z } from 'zod';

const invoice = z.object({
  status: z.enum(['paid', 'refunded', 'partial_refund']),
  refunded: z.boolean(),
  refunded_amount: z.number().nonnegative().optional(),
  billing_reason: z.enum(['initial', 'renewal', 'updated']),
  total: z.number().int().nonnegative(),
  subtotal: z.number().int().nonnegative(),
  currency: z.string().length(3),
  test_mode: z.boolean(),
  created_at: z.string(),
});

/** Called only after signature verification and successful canonical subscription reconciliation. */
export async function recordPayment(
  env: CloudflareBindings,
  subscriptionId: string,
  invoiceId: string,
  attributes: unknown,
  fingerprint: string,
) {
  const parsed = invoice.safeParse(attributes);
  if (!parsed.success) return;
  const data = parsed.data;
  if (data.billing_reason === 'updated') return;
  const refunded = data.refunded || (data.refunded_amount ?? 0) > 0 || data.status !== 'paid';
  const occurredAt = Date.parse(data.created_at);
  if (!Number.isFinite(occurredAt)) return;
  const name = data.billing_reason === 'initial' ? 'payment_verified' : 'renewal_verified';
  await env.DB.prepare(
    `INSERT OR IGNORE INTO product_events
    (id,dedupe_key,name,user_id,project_id,received_at,occurred_at,source,properties_json)
    SELECT ?,?,?,s.user_id,p.id,?,?,'server',? FROM subscriptions s LEFT JOIN projects p ON p.user_id=s.user_id
    WHERE s.lemon_squeezy_subscription_id=? AND EXISTS(SELECT 1 FROM billing_webhook_receipts WHERE fingerprint=? AND processed_at IS NOT NULL)
    ON CONFLICT(dedupe_key) DO UPDATE SET properties_json=json_set(product_events.properties_json,'$.refunded',json('true'))
    WHERE product_events.user_id=excluded.user_id AND json_extract(excluded.properties_json,'$.refunded')=1`,
  )
    .bind(
      crypto.randomUUID(),
      `invoice:${invoiceId}`,
      name,
      Date.now(),
      occurredAt,
      JSON.stringify({
        invoiceId,
        subscriptionId,
        amount: data.total,
        subtotal: data.subtotal,
        currency: data.currency,
        testMode: data.test_mode,
        billingReason: data.billing_reason,
        refunded,
      }),
      subscriptionId,
      fingerprint,
    )
    .run();
}

import { z } from 'zod';

const eventNames = [
  'subscription_created',
  'subscription_updated',
  'subscription_cancelled',
  'subscription_resumed',
  'subscription_expired',
  'subscription_paused',
  'subscription_unpaused',
  'subscription_payment_success',
  'subscription_payment_failed',
  'subscription_payment_recovered',
] as const;
export const lemonWebhookSchema = z.object({
  meta: z.object({
    event_name: z.enum(eventNames),
    custom_data: z.object({ user_id: z.string().min(1) }).optional(),
  }),
  data: z.object({
    type: z.string().min(1),
    id: z.string().min(1),
    attributes: z.looseObject({
      store_id: z.number(),
      test_mode: z.boolean(),
      product_id: z.number().optional(),
      variant_id: z.number().optional(),
      subscription_id: z.number().optional(),
    }),
  }),
});

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1)
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}
export async function sha256(value: ArrayBuffer): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', value));
}
export async function verifyWebhookSignature(
  raw: ArrayBuffer,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  if (!signature || !/^[a-f0-9]{64}$/iu.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const expected = await crypto.subtle.sign('HMAC', key, raw);
  const provided = Uint8Array.from(signature.match(/.{2}/gu) ?? [], (part) =>
    Number.parseInt(part, 16),
  );
  return constantTimeEqual(new Uint8Array(expected), provided);
}

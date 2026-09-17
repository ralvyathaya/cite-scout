import { describe, expect, it } from 'vitest';
import {
  lemonWebhookSchema,
  sha256,
  verifyWebhookSignature,
} from '../../src/integrations/lemonsqueezy/webhook';

const SECRET = 'webhook-signing-secret';

async function sign(body: string, secret = SECRET): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function toBuffer(text: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(text);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe('Lemon Squeezy webhook signature verification', () => {
  it('accepts a valid hexadecimal HMAC over the exact raw body', async () => {
    const body = '{"meta":{"event_name":"subscription_created"}}';
    await expect(verifyWebhookSignature(toBuffer(body), await sign(body), SECRET)).resolves.toBe(
      true,
    );
  });

  it('rejects a missing signature', async () => {
    await expect(verifyWebhookSignature(toBuffer('{}'), null, SECRET)).resolves.toBe(false);
  });

  it('rejects a malformed signature without throwing', async () => {
    for (const bad of ['', 'zzzz', 'abc', 'not-a-hex-signature', 'f'.repeat(63), 'f'.repeat(65)]) {
      await expect(verifyWebhookSignature(toBuffer('{}'), bad, SECRET)).resolves.toBe(false);
    }
  });

  it('rejects a well-formed but incorrect signature', async () => {
    await expect(verifyWebhookSignature(toBuffer('{}'), 'a'.repeat(64), SECRET)).resolves.toBe(
      false,
    );
  });

  it('rejects a signature computed with the wrong secret', async () => {
    const body = '{"meta":{}}';
    await expect(
      verifyWebhookSignature(toBuffer(body), await sign(body, 'some-other-secret'), SECRET),
    ).resolves.toBe(false);
  });

  it('binds verification to the exact raw bytes, not to re-serialized JSON', async () => {
    const original = '{"a":1}';
    const reserialised = '{ "a": 1 }';
    const signature = await sign(original);

    await expect(verifyWebhookSignature(toBuffer(original), signature, SECRET)).resolves.toBe(true);
    await expect(verifyWebhookSignature(toBuffer(reserialised), signature, SECRET)).resolves.toBe(
      false,
    );
  });

  it('rejects a signature that only matches a prefix of the body', async () => {
    const body = '{"meta":{"event_name":"subscription_created"}}';
    const truncated = body.slice(0, 20);
    await expect(
      verifyWebhookSignature(toBuffer(body), await sign(truncated), SECRET),
    ).resolves.toBe(false);
  });

  it('produces a stable SHA-256 fingerprint that differs for different payloads', async () => {
    const first = await sha256(toBuffer('{"a":1}'));
    const second = await sha256(toBuffer('{"a":1}'));
    const third = await sha256(toBuffer('{"a":2}'));

    expect(first).toBe(second);
    expect(first).not.toBe(third);
    expect(first).toMatch(/^[a-f0-9]{64}$/u);
  });
});

describe('Lemon Squeezy webhook payload validation', () => {
  const subscriptionPayload = {
    meta: { event_name: 'subscription_created', custom_data: { user_id: 'user-1' } },
    data: {
      type: 'subscriptions',
      id: '42',
      attributes: { store_id: 1, test_mode: true, product_id: 2, variant_id: 3 },
    },
  };

  it('accepts every subscribed lifecycle event', () => {
    const events = [
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
    ];
    for (const event of events) {
      const result = lemonWebhookSchema.safeParse({
        ...subscriptionPayload,
        meta: { ...subscriptionPayload.meta, event_name: event },
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects an unexpected event name', () => {
    const result = lemonWebhookSchema.safeParse({
      ...subscriptionPayload,
      meta: { ...subscriptionPayload.meta, event_name: 'order_created' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a payload with no resource id', () => {
    const result = lemonWebhookSchema.safeParse({
      ...subscriptionPayload,
      data: { ...subscriptionPayload.data, id: '' },
    });
    expect(result.success).toBe(false);
  });
});

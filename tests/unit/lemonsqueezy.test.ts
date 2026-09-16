import { describe, expect, it, vi } from 'vitest';
import { LemonSqueezyClient } from '../../src/integrations/lemonsqueezy/client';
import { verifyWebhookSignature } from '../../src/integrations/lemonsqueezy/webhook';

describe('Lemon Squeezy integration', () => {
  it('accepts only the exact signed raw body', async () => {
    const raw = new TextEncoder().encode('{"ok":true}');
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('secret'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const digest = await crypto.subtle.sign('HMAC', key, raw);
    const signature = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    expect(await verifyWebhookSignature(raw.buffer, signature, 'secret')).toBe(true);
    expect(
      await verifyWebhookSignature(
        new TextEncoder().encode('{ "ok": true }').buffer,
        signature,
        'secret',
      ),
    ).toBe(false);
    expect(await verifyWebhookSignature(raw.buffer, 'bad', 'secret')).toBe(false);
  });
  it('checkout restricts the variant and includes immutable user identity', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            type: 'checkouts',
            attributes: { url: 'https://store.lemonsqueezy.com/checkout/1' },
          },
        }),
        { status: 201 },
      ),
    );
    const client = new LemonSqueezyClient('key', fetcher);
    await client.createCheckout({
      storeId: '1',
      variantId: '2',
      email: 'a@example.com',
      userId: 'user_1',
      redirectUrl: 'https://app.example.com/app/billing?checkout=complete',
    });
    const init = fetcher.mock.calls[0]?.[1];
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '') as {
      data: {
        attributes: {
          product_options: { enabled_variants: number[] };
          checkout_data: { custom: { user_id: string } };
        };
        relationships: { variant: { data: { id: string } } };
      };
    };
    expect(body.data.attributes.checkout_data.custom.user_id).toBe('user_1');
    expect(body.data.attributes.product_options.enabled_variants).toEqual([2]);
    expect(body.data.relationships.variant.data.id).toBe('2');
  });
});

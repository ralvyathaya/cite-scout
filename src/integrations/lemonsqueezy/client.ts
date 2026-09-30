import { z } from 'zod';

const subscriptionAttributesSchema = z.object({
  store_id: z.number(),
  customer_id: z.number(),
  order_id: z.number().nullable(),
  product_id: z.number(),
  variant_id: z.number(),
  status: z.enum(['on_trial', 'active', 'paused', 'past_due', 'unpaid', 'cancelled', 'expired']),
  cancelled: z.boolean(),
  renews_at: z.string().nullable(),
  ends_at: z.string().nullable(),
  trial_ends_at: z.string().nullable(),
  payment_processor: z.string().nullable(),
  card_brand: z.string().nullable(),
  card_last_four: z.string().nullable(),
  test_mode: z.boolean(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  urls: z.object({ customer_portal: z.url() }),
});
const subscriptionDocumentSchema = z.object({
  data: z.object({
    type: z.literal('subscriptions'),
    id: z.string(),
    attributes: subscriptionAttributesSchema,
  }),
});
const checkoutDocumentSchema = z.object({
  data: z.object({ type: z.literal('checkouts'), attributes: z.object({ url: z.url() }) }),
});
export type LemonSubscription = z.infer<typeof subscriptionDocumentSchema>['data'];

export class LemonSqueezyClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  private async request(path: string, init?: RequestInit): Promise<Response> {
    // NOTE: see PerplexityProvider — never call the fetcher as a method.
    const fetcher = this.fetcher;
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${this.apiKey}`);
    headers.set('Accept', 'application/vnd.api+json');
    headers.set('Content-Type', 'application/vnd.api+json');
    const response = await fetcher(`https://api.lemonsqueezy.com/v1${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`LEMON_SQUEEZY_HTTP_${String(response.status)}`);
    return response;
  }
  async createCheckout(input: {
    storeId: string;
    variantId: string;
    email: string;
    userId: string;
    redirectUrl: string;
    testMode: boolean;
  }): Promise<string> {
    const response = await this.request('/checkouts', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            product_options: {
              redirect_url: input.redirectUrl,
              enabled_variants: [Number(input.variantId)],
            },
            checkout_data: { email: input.email, custom: { user_id: input.userId } },
            test_mode: input.testMode,
          },
          relationships: {
            store: { data: { type: 'stores', id: input.storeId } },
            variant: { data: { type: 'variants', id: input.variantId } },
          },
        },
      }),
    });
    return checkoutDocumentSchema.parse(await response.json()).data.attributes.url;
  }
  async getSubscription(id: string): Promise<LemonSubscription> {
    const response = await this.request(`/subscriptions/${encodeURIComponent(id)}`);
    return subscriptionDocumentSchema.parse(await response.json()).data;
  }
}

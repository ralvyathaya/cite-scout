import { z } from 'zod';

const responseSchema = z.object({
  success: z.boolean(),
  hostname: z.string().optional(),
  action: z.string().optional(),
  'error-codes': z.array(z.string()).optional(),
});
export async function verifyTurnstile(input: {
  token: string;
  secret: string;
  expectedAction: string;
  expectedHostname: string;
  remoteIp?: string;
  fetcher?: typeof fetch;
}): Promise<boolean> {
  if (!input.token || input.token.length > 2048) return false;
  const response = await (input.fetcher ?? fetch)(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: input.secret,
        response: input.token,
        remoteip: input.remoteIp ?? '',
        idempotency_key: crypto.randomUUID(),
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) return false;
  const result = responseSchema.safeParse(await response.json());
  return (
    result.success &&
    result.data.success &&
    result.data.action === input.expectedAction &&
    result.data.hostname === input.expectedHostname
  );
}

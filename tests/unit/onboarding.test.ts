import { expect, it, vi } from 'vitest';
import {
  generateOnboardingDraft,
  onboardingWebsite,
  readWebsiteProfile,
} from '../../src/integrations/onboarding';
import { syntheticOnboardingSuggestion as example } from '../../src/shared/onboarding-fixture';
import { GeoFixtureWorkspace } from '../../src/client/pages/v2/geo-fixture';
import { readPublicPage } from '../../src/integrations/public-page';

function envelope(draft: unknown = example.draft, changes: Record<string, unknown> = {}) {
  return {
    status: 'completed',
    model: 'gpt-6-luna-2026-10-01',
    usage: { input_tokens: 1200, output_tokens: 600 },
    output: [
      { type: 'reasoning' },
      {
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: JSON.stringify(draft) }],
      },
    ],
    ...changes,
  };
}
it('normalizes the public homepage without forwarding query strings, paths, or credentials', () => {
  expect(
    onboardingWebsite('https://www.cedarflow.example/features?token=private#fragment'),
  ).toEqual({ domain: 'cedarflow.example', url: 'https://cedarflow.example/' });
  for (const input of [
    'file:///etc/passwd',
    'https://user:pass@brand.example/',
    'https://brand.example:8443/',
    'not a url',
  ])
    expect(() => onboardingWebsite(input)).toThrow('UNSAFE_PAGE_TARGET');
});
it('reads bounded public metadata for SPA shells without running scripts or inventing missing content', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(
        '<html><head><title>CedarFlow</title><meta name="description" content="Customer onboarding software for small B2B SaaS teams."></head><body><script>secret instructions</script><div id="root"></div></body></html>',
        { headers: { 'Content-Type': 'text/html' } },
      ),
    );
  const source = await readWebsiteProfile(
    'cedarflow.example',
    fetcher,
    vi.fn().mockResolvedValue(['1.1.1.1']),
  );
  expect(source.title).toBe('CedarFlow');
  expect(source.description).toContain('Customer onboarding');
  expect(source.text).not.toContain('secret instructions');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('rejects private, mixed DNS, invalid redirects, errors and empty or oversized pages before inference', async () => {
  const fetcher = vi.fn();
  await expect(readWebsiteProfile('127.0.0.1', fetcher)).rejects.toThrow('UNSAFE_PAGE_TARGET');
  await expect(
    readWebsiteProfile(
      'brand.example',
      fetcher,
      vi.fn().mockResolvedValue(['1.1.1.1', '10.0.0.1']),
    ),
  ).rejects.toThrow('NON_PUBLIC_DNS');
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockResolvedValue(
    new Response(null, {
      status: 302,
      headers: { location: 'https://169.254.169.254/latest/meta-data/' },
    }),
  );
  await expect(
    readWebsiteProfile('brand.example', fetcher, vi.fn().mockResolvedValue(['1.1.1.1'])),
  ).rejects.toThrow('UNSAFE_PAGE_TARGET');
  expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockResolvedValue(
    new Response('<h1>Brand access denied</h1>', {
      status: 403,
      headers: { 'Content-Type': 'text/html' },
    }),
  );
  await expect(
    readWebsiteProfile('brand.example', fetcher, vi.fn().mockResolvedValue(['1.1.1.1'])),
  ).rejects.toThrow('WEBSITE_UNREADABLE');
  fetcher.mockResolvedValue(
    new Response('<div id="root"></div>', { headers: { 'Content-Type': 'text/html' } }),
  );
  await expect(
    readWebsiteProfile('brand.example', fetcher, vi.fn().mockResolvedValue(['1.1.1.1'])),
  ).rejects.toThrow('WEBSITE_TOO_LITTLE_TEXT');
  fetcher.mockResolvedValue(
    new Response('x'.repeat(128 * 1024 + 1), { headers: { 'Content-Type': 'text/html' } }),
  );
  await expect(
    readWebsiteProfile('brand.example', fetcher, vi.fn().mockResolvedValue(['1.1.1.1'])),
  ).rejects.toThrow('PAGE_BYTE_LIMIT');
});
it('uses one bounded structured Responses request without tools, retries, or stored provider output', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(envelope()));
  const value = await generateOnboardingDraft('synthetic-secret', example.source, fetcher);
  expect(value.draft).toEqual(example.draft);
  expect(value.estimatedCostUsd).toBeCloseTo(0.00042);
  const sent = fetcher.mock.calls[0]?.[1]?.body;
  if (typeof sent !== 'string') throw new Error('Expected a serialized JSON request');
  const body: unknown = JSON.parse(sent);
  expect(body).toMatchObject({
    model: 'gpt-6-luna',
    max_output_tokens: 1600,
    store: false,
    reasoning: { effort: 'none' },
    text: { format: { type: 'json_schema', strict: true } },
  });
  expect(body).not.toHaveProperty('tools');
  expect(JSON.stringify(body)).not.toContain('synthetic-secret');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([
  envelope(example.draft, { status: 'incomplete' }),
  envelope({ ...example.draft, brandEvidence: 'Invented quotation' }),
  envelope({ ...example.draft, brandName: 'Invented brand' }),
  envelope({ ...example.draft, competitors: [{ name: 'CedarFlow', reason: 'Self competitor' }] }),
  envelope({
    ...example.draft,
    questions: [example.draft.questions[0], example.draft.questions[0], example.draft.questions[0]],
  }),
  envelope(example.draft, {
    output: [
      {
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'refusal', refusal: 'No business found' }],
      },
    ],
  }),
])('rejects incomplete, refused, malformed or unsupported drafts without retry', async (raw) => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(raw));
  await expect(generateOnboardingDraft('synthetic', example.source, fetcher)).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('does not hide unknown pricing behind a zero estimate or retry a provider error', async () => {
  const changed = vi
    .fn()
    .mockResolvedValue(Response.json(envelope(example.draft, { model: 'unknown-upstream-model' })));
  expect(
    (await generateOnboardingDraft('synthetic', example.source, changed)).estimatedCostUsd,
  ).toBeNull();
  const failed = vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 }));
  await expect(generateOnboardingDraft('synthetic', example.source, failed)).rejects.toThrow(
    'SUGGESTION_PROVIDER_UNAVAILABLE',
  );
  expect(failed).toHaveBeenCalledTimes(1);
});
it('keeps native fixture suggestions synthetic and outside monitoring observations', async () => {
  const workspace = new GeoFixtureWorkspace();
  const before = await workspace.request('/geo/observations');
  expect(
    await workspace.request('/onboarding/suggestions', { website: 'anything.example' }, 'POST'),
  ).toEqual(example);
  expect(await workspace.request('/geo/observations')).toEqual(before);
});
it('never follows a same-domain redirect to privately resolved hosts', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response(null, { status: 302, headers: { location: 'https://private.brand.example/' } }),
    );
  const resolver = vi
    .fn()
    .mockResolvedValueOnce(['1.1.1.1'])
    .mockResolvedValueOnce(['192.168.1.1']);
  await expect(
    readPublicPage('https://brand.example/', 'brand.example', fetcher, resolver),
  ).rejects.toThrow('NON_PUBLIC_DNS');
  expect(fetcher).toHaveBeenCalledTimes(1);
});

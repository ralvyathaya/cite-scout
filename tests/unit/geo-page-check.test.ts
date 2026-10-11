import { expect, it, vi } from 'vitest';
import { checkOwnedPage, isPublicAddress } from '../../src/integrations/page-check';
it('rejects private/mapped/loopback and non-owned targets before fetch', async () => {
  for (const address of [
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '100.64.0.1',
    '::1',
    '::ffff:127.0.0.1',
    'fe80::1',
    '2001:db8::1',
  ])
    expect(isPublicAddress(address)).toBe(false);
  expect(isPublicAddress('1.1.1.1')).toBe(true);
  expect(isPublicAddress('2606:4700:4700::1111')).toBe(true);
  const fetcher = vi.fn(),
    resolver = vi.fn().mockResolvedValue(['127.0.0.1']);
  expect(
    (await checkOwnedPage('https://brand.example/', 'brand.example', fetcher, resolver)).status,
  ).toBe('rejected');
  expect(
    (await checkOwnedPage('https://brand.example.evil.com/', 'brand.example', fetcher, resolver))
      .status,
  ).toBe('rejected');
  expect(fetcher).not.toHaveBeenCalled();
});
it('validates each redirect, bounds content and reports measured signals without claiming index status', async () => {
  const resolver = vi.fn().mockResolvedValue(['1.1.1.1']);
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } }),
    );
  expect(
    (await checkOwnedPage('https://brand.example/', 'brand.example', fetcher, resolver)).status,
  ).toBe('rejected');
  expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockResolvedValueOnce(
    new Response(
      '<meta content="noindex" name="robots"><link href="/canonical" rel="canonical"><p>Setup takes 5 minutes.</p>',
      { headers: { 'content-type': 'text/html' } },
    ),
  );
  const checked = await checkOwnedPage(
    'https://brand.example/',
    'brand.example',
    fetcher,
    resolver,
  );
  expect(checked).toMatchObject({
    status: 'checked',
    noindex: true,
    canonical: 'https://brand.example/canonical',
    httpStatus: 200,
  });
  expect(checked).not.toHaveProperty('indexed');
});
it('cancels streamed HTML as soon as its body exceeds 128 KiB', async () => {
  const cancel = vi.fn();
  let pulls = 0;
  const chunk = new TextEncoder().encode(`<html>${'x'.repeat(64 * 1024 - 6)}`);
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls++;
        controller.enqueue(pulls <= 2 ? chunk : new Uint8Array([120]));
      },
      cancel,
    },
    { highWaterMark: 0 },
  );
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response(body, { headers: { 'content-type': 'text/html' } }));
  const checked = await checkOwnedPage(
    'https://brand.example/',
    'brand.example',
    fetcher,
    vi.fn().mockResolvedValue(['1.1.1.1']),
  );
  expect(checked).toMatchObject({
    status: 'unavailable',
    reason: 'PAGE_BYTE_LIMIT',
    excerpt: null,
  });
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(pulls).toBe(3);
  expect(body.locked).toBe(false);
});

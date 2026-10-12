/// <reference types="node" />
import { resolve4, resolve6 } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { belongsToDomain } from '../domain/geo-classification';
import type { GeoPageCheck } from '../shared/geo-analysis';
const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(address, prefix, 'ipv4');
blocked.addSubnet('2001:db8::', 32, 'ipv6');
export function isPublicAddress(address: string) {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  return family === 6 && /^[23][0-9a-f]{3}:/iu.test(address) && !blocked.check(address, 'ipv6');
}
async function publicDns(host: string) {
  const records = await Promise.allSettled([resolve4(host), resolve6(host)]);
  const addresses: string[] = [];
  for (const record of records) {
    if (record.status === 'fulfilled') addresses.push(...record.value);
    else if (!['ENODATA', 'ENOTFOUND'].includes((record.reason as { code?: string }).code ?? ''))
      throw new Error('DNS_UNAVAILABLE');
  }
  return addresses;
}
export async function checkOwnedPage(
  target: string,
  domain: string,
  fetcher: typeof fetch = fetch,
  resolver: typeof publicDns = publicDns,
): Promise<GeoPageCheck> {
  const result: GeoPageCheck = {
    id: crypto.randomUUID(),
    target,
    finalUrl: null,
    status: 'unavailable',
    httpStatus: null,
    noindex: null,
    canonical: null,
    robots: null,
    excerpt: null,
    checkedAt: new Date().toISOString(),
    reason: null,
  };
  const signal = AbortSignal.timeout(10000);
  try {
    let url = new URL(target);
    for (let hop = 0; hop <= 3; hop++) {
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        (url.port && url.port !== '443') ||
        !belongsToDomain(url.href, domain) ||
        isIP(url.hostname.replace(/[[\]]/gu, '')) ||
        !url.hostname.includes('.') ||
        /\.(?:local|localhost|internal|test)$/iu.test(url.hostname)
      )
        return { ...result, status: 'rejected', reason: 'UNSAFE_PAGE_TARGET' };
      const addresses = await Promise.race([
        resolver(url.hostname),
        new Promise<never>((_, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              reject(new Error('PAGE_TIMEOUT'));
            },
            { once: true },
          );
        }),
      ]);
      if (!addresses.length || addresses.some((address) => !isPublicAddress(address)))
        return { ...result, status: 'rejected', reason: 'NON_PUBLIC_DNS' };
      if (signal.aborted) throw new Error('PAGE_TIMEOUT');
      const response = await fetcher(url.href, {
        redirect: 'manual',
        signal,
        headers: { 'User-Agent': 'CiteScout-PageCheck/1.0', Accept: 'text/html' },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get('location');
        if (!location || hop === 3) throw new Error('PAGE_REDIRECT_LIMIT');
        url = new URL(location, url);
        continue;
      }
      result.finalUrl = url.href;
      result.httpStatus = response.status;
      if (!response.headers.get('content-type')?.includes('text/html')) {
        await response.body?.cancel();
        return { ...result, status: 'checked', reason: 'NON_HTML_RESPONSE' };
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error('PAGE_EMPTY_BODY');
      const bytes = new Uint8Array(128 * 1024);
      let size = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          if (size + chunk.value.length > bytes.length) {
            await reader.cancel();
            throw new Error('PAGE_BYTE_LIMIT');
          }
          bytes.set(chunk.value, size);
          size += chunk.value.length;
        }
      } finally {
        reader.releaseLock();
      }
      const html = new TextDecoder().decode(bytes.subarray(0, size));
      const attrs = (tag: string): Record<string, string> => {
        const attributes: Record<string, string> = {};
        for (const match of tag.matchAll(/([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/giu)) {
          if (match[1]) attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
        }
        return attributes;
      };
      const robots = Array.from(html.matchAll(/<meta\b[^>]*>/giu), (match) => attrs(match[0]))
        .filter((meta) => meta.name?.toLowerCase() === 'robots')
        .map((meta) => meta.content ?? '');
      const header = response.headers.get('x-robots-tag') ?? '';
      result.robots = [...robots, header].filter(Boolean).join('; ') || null;
      result.noindex =
        robots.some((value) => /\bnoindex\b/iu.test(value)) || /(?:^|,)\s*noindex\b/iu.test(header);
      const canonical = Array.from(html.matchAll(/<link\b[^>]*>/giu), (match) =>
        attrs(match[0]),
      ).find((link) => link.rel?.toLowerCase() === 'canonical')?.href;
      result.canonical = canonical ? new URL(canonical, url).href : null;
      result.excerpt = html
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/giu, ' ')
        .replace(/<[^>]*>/gu, ' ')
        .replace(/\s+/gu, ' ')
        .trim()
        .slice(0, 8000);
      return { ...result, status: 'checked', checkedAt: new Date().toISOString() };
    }
  } catch (error) {
    result.reason = signal.aborted
      ? 'PAGE_TIMEOUT'
      : error instanceof Error && /^[A-Z_]+$/u.test(error.message)
        ? error.message
        : 'PAGE_UNAVAILABLE';
  }
  return result;
}

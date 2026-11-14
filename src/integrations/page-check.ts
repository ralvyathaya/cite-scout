import type { GeoPageCheck } from '../shared/geo-analysis';
import { htmlAttributes, PublicPageError, publicDns, readPublicPage } from './public-page';
export { isPublicAddress } from './public-page';

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
  try {
    const page = await readPublicPage(target, domain, fetcher, resolver);
    result.finalUrl = page.url;
    result.httpStatus = page.status;
    if (page.html === null) return { ...result, status: 'checked', reason: 'NON_HTML_RESPONSE' };
    const html = page.html;
    const robots = Array.from(html.matchAll(/<meta\b[^>]*>/giu), (match) =>
      htmlAttributes(match[0]),
    )
      .filter((meta) => meta.name?.toLowerCase() === 'robots')
      .map((meta) => meta.content ?? '');
    const header = page.headers.get('x-robots-tag') ?? '';
    result.robots = [...robots, header].filter(Boolean).join('; ') || null;
    result.noindex =
      robots.some((value) => /\bnoindex\b/iu.test(value)) || /(?:^|,)\s*noindex\b/iu.test(header);
    const canonical = Array.from(html.matchAll(/<link\b[^>]*>/giu), (match) =>
      htmlAttributes(match[0]),
    ).find((link) => link.rel?.toLowerCase() === 'canonical')?.href;
    result.canonical = canonical ? new URL(canonical, page.url).href : null;
    result.excerpt = html
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/giu, ' ')
      .replace(/<[^>]*>/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim()
      .slice(0, 8000);
    return { ...result, status: 'checked', checkedAt: new Date().toISOString() };
  } catch (error) {
    if (error instanceof PublicPageError) {
      result.finalUrl = error.url;
      result.httpStatus = error.status;
    }
    result.reason =
      error instanceof Error && error.name === 'TimeoutError'
        ? 'PAGE_TIMEOUT'
        : error instanceof Error && /^[A-Z_]+$/u.test(error.message)
          ? error.message
          : 'PAGE_UNAVAILABLE';
    if (['UNSAFE_PAGE_TARGET', 'NON_PUBLIC_DNS'].includes(result.reason))
      result.status = 'rejected';
  }
  return result;
}

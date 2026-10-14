import { describe, expect, it } from 'vitest';
import { redactProviderData } from '../../src/integrations/provider-redaction';

describe('provider credential redaction', () => {
  it('removes credential fields without mutating prompt, answer or usage', () => {
    const raw = {
      search_parameters: { api_key: 'private', page_token: 'temporary', q: 'API comparison?' },
      headers: { Authorization: 'Bearer private', 'X-Api-Key': 'private' },
      answer: 'The API supports search.',
      usage: { input_tokens: 21, output_tokens: 9 },
    };
    expect(redactProviderData(raw)).toEqual({
      search_parameters: { q: 'API comparison?' },
      headers: {},
      answer: raw.answer,
      usage: raw.usage,
    });
    expect(raw.search_parameters.api_key).toBe('private');
  });

  it('redacts supplied secrets in prose, encoded URLs and errors', () => {
    const secret = 'sentinel/with+space key';
    const url = `https://serpapi.com/search.json?api_key=${encodeURIComponent(secret)}&q=Orbit`;
    const raw = {
      error: `Request failed: ${url}; credential ${secret}`,
      link: encodeURIComponent(url),
      nested: encodeURIComponent(encodeURIComponent(secret)),
      exception: new Error(`Failure with ${secret}`),
    };
    const serialized = JSON.stringify(redactProviderData(raw, [secret]));
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(encodeURIComponent(secret));
    expect(serialized).not.toContain(encodeURIComponent(encodeURIComponent(secret)));
    expect(serialized).toContain('Orbit');
    expect(serialized).toContain('[REDACTED]');
  });

  it('sanitizes credential assignments in downloaded raw without current keys', () => {
    const raw = {
      link: 'https://serpapi.com/search.json?api_key=old-secret&q=Orbit',
      encoded: 'https%3A%2F%2Fserpapi.com%2Fsearch.json%3Fapi_key%3Dold-secret%26q%3DOrbit',
      error: 'Authorization: Bearer old-secret',
      safe: 'User-facing API key setup instructions.',
    };
    const redacted = JSON.stringify(redactProviderData(raw));
    expect(redacted).not.toContain('old-secret');
    expect(redacted).toContain('Orbit');
    expect(redacted).toContain(raw.safe);
  });

  it('does not let excessive provider nesting overflow the redactor', () => {
    let raw: unknown = { api_key: 'private' };
    for (let depth = 0; depth < 80; depth++) raw = { nested: raw };
    expect(() => redactProviderData(raw)).not.toThrow();
    expect(JSON.stringify(redactProviderData(raw))).not.toContain('private');
  });
});

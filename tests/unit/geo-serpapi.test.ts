import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureSerpApiGeo, SerpApiError } from '../../src/integrations/serpapi/geo';
import { geoSurfaces, type GeoRequestContext } from '../../src/shared/geo';

// Synthetic documented envelopes exercise parsing; they are not live monitoring results.
const context = (engine: 'google_aio' | 'bing_copilot' = 'google_aio'): GeoRequestContext => ({
  schemaVersion: 'geo-context-1',
  projectId: 'p',
  contextVersion: 1,
  settingsRevision: 1,
  promptId: 'q',
  promptVersionId: 'qv',
  promptText: 'C++ tools at 50%?',
  engine,
  ...geoSurfaces[engine],
  collectorVersion: 'geo-collector-1',
  languageCode: 'en',
  locationCode: 2840,
  device: 'desktop',
  forceWebSearch: false,
  brand: { id: 'b', name: 'Orbit', domain: 'orbit.example' },
  competitors: [],
  instructionVersion: 'neutral-research-1',
  maxOutputTokens: 500,
});
const envelope = (data: Record<string, unknown> = {}, id = 'search-1') => ({
  search_metadata: { id, status: 'Success' },
  ...data,
});
const reply = (raw: unknown, status = 200) => new Response(JSON.stringify(raw), { status });
const allow = () => Promise.resolve();
const requestUrl = (value: RequestInfo | URL | undefined) =>
  new URL(
    typeof value === 'string' ? value : value instanceof URL ? value.href : (value?.url ?? ''),
  );
const overview = {
  text_blocks: [{ type: 'paragraph', snippet: 'Orbit is an option.', reference_indexes: [0] }],
  references: [{ index: 0, title: 'Evidence', link: 'https://evidence.example/' }],
};

afterEach(() => vi.restoreAllMocks());

describe('bounded SerpApi captures', () => {
  it('sends literal Google prompt fresh and preserves answer and reference provenance', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(reply(envelope({ ai_overview: overview })));
    const before = vi.fn<() => Promise<void>>().mockResolvedValue();
    const capture = await captureSerpApiGeo('private', context(), before, fetcher);
    const url = requestUrl(fetcher.mock.calls[0]?.[0]);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      engine: 'google',
      q: 'C++ tools at 50%?',
      hl: 'en',
      gl: 'us',
      device: 'desktop',
      no_cache: 'true',
    });
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: 'GET', redirect: 'manual' });
    expect(before).toHaveBeenCalledTimes(1);
    expect(capture).toMatchObject({
      answerText: 'Orbit is an option.',
      quality: 'complete',
      model: null,
      providerRequestId: 'search-1',
      providerStatus: 'Success',
      reportedCost: null,
    });
    expect(capture.sources.some((source) => source.referenceLevel === 'answer')).toBe(true);
    expect(capture.sources.every((source) => source.spans === undefined)).toBe(true);
  });

  it('reserves every follow-up, uses a fixed endpoint, and redacts both raw envelopes', async () => {
    const first = envelope({
      ai_overview: { page_token: 'temporary-token', serpapi_link: 'https://evil.example/' },
      search_parameters: { api_key: 'private' },
      organic_results: [],
    });
    const second = envelope(
      { ai_overview: overview, debug: 'https://serpapi.com/?api_key=private' },
      'search-2',
    );
    const fetcher = vi.fn<typeof fetch>();
    const events: string[] = [];
    const before = vi.fn(() => {
      events.push('reserve');
      return Promise.resolve();
    });
    fetcher
      .mockImplementationOnce(() => {
        events.push('fetch');
        return Promise.resolve(reply(first));
      })
      .mockImplementationOnce(() => {
        events.push('fetch');
        return Promise.resolve(reply(second));
      });
    const capture = await captureSerpApiGeo('private', context(), before, fetcher);
    const url = requestUrl(fetcher.mock.calls[1]?.[0]);
    expect(url.origin + url.pathname).toBe('https://serpapi.com/search.json');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      engine: 'google_ai_overview',
      page_token: 'temporary-token',
      no_cache: 'true',
    });
    expect(events).toEqual(['reserve', 'fetch', 'reserve', 'fetch']);
    expect(capture.providerRequestId).toBe('search-2');
    expect(capture.raw).toHaveProperty('search');
    expect(capture.raw).toHaveProperty('aiOverview');
    expect(JSON.stringify(capture.raw)).not.toContain('private');
    expect(JSON.stringify(capture.raw)).not.toContain('temporary-token');
  });

  it('does not fetch when the first reservation is rejected', async () => {
    const rejected = new Error('QUOTA_LIMIT');
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      captureSerpApiGeo('key', context(), () => Promise.reject(rejected), fetcher),
    ).rejects.toBe(rejected);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not submit a follow-up when the second reservation is rejected', async () => {
    const rejected = new Error('QUOTA_LIMIT');
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(reply(envelope({ ai_overview: { page_token: 'token' } })));
    const before = vi
      .fn<() => Promise<void>>()
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(rejected);
    await expect(captureSerpApiGeo('key', context(), before, fetcher)).rejects.toBe(rejected);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('never fetches an expired page token', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(now)
      .mockReturnValue(now + 61_000);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(reply(envelope({ ai_overview: { page_token: 'token' } })));
    await expect(captureSerpApiGeo('key', context(), allow, fetcher)).rejects.toThrow(
      'SERPAPI_TOKEN_EXPIRED',
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('keeps a valid feature-free SERP distinct from present-but-empty or malformed captures', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(reply(envelope({ organic_results: [] })))
      .mockResolvedValueOnce(reply(envelope({ ai_overview: { text_blocks: [] } })))
      .mockResolvedValueOnce(reply({}));
    expect((await captureSerpApiGeo('key', context(), allow, fetcher)).quality).toBe('no_feature');
    expect((await captureSerpApiGeo('key', context(), allow, fetcher)).quality).toBe('partial');
    await expect(captureSerpApiGeo('key', context(), allow, fetcher)).rejects.toThrow(
      'SERPAPI_MALFORMED_RESPONSE',
    );
  });

  it('preserves list and comparison table text while retaining the original structure', async () => {
    const feature = {
      text_blocks: [
        {
          type: 'list',
          list: [{ title: 'Orbit', snippet: 'Works for teams.' }, { snippet: 'Second option.' }],
        },
        {
          type: 'comparison',
          product_labels: ['Orbit', 'Other'],
          comparison: [{ feature: 'Speed', values: ['Fast', 'Slow'] }],
        },
        {
          type: 'table',
          table: [
            ['Plan', 'Price'],
            ['Free', '$0'],
          ],
        },
      ],
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(reply(envelope({ ai_overview: feature })));
    const capture = await captureSerpApiGeo('key', context(), allow, fetcher);
    expect(capture.quality).toBe('complete');
    for (const text of [
      'Orbit',
      'Works for teams.',
      'Second option.',
      'Speed',
      'Fast',
      'Slow',
      'Plan',
      '$0',
    ])
      expect(capture.answerText).toContain(text);
    expect(capture.raw).toMatchObject({ search: { ai_overview: feature } });
  });

  it('keeps invalid source indexes, bad URLs and unsupported answer blocks partial', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      reply(
        envelope({
          ai_overview: {
            text_blocks: [
              { type: 'paragraph', snippet: 'Answer', reference_indexes: [99] },
              { type: 'unknown', snippet: 'Untrusted' },
            ],
            references: [{ index: 0, link: 'javascript:alert(1)' }],
          },
        }),
      ),
    );
    const capture = await captureSerpApiGeo('key', context(), allow, fetcher);
    expect(capture.quality).toBe('partial');
    expect(capture.answerText).toBe('Answer');
    expect(capture.sources).toEqual([]);
  });

  it('uses Bing overview and question/answer content, excluding organic snippets', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      reply(
        envelope({
          organic_results: [
            {
              title: 'Organic',
              link: 'https://organic.example/',
              snippet: 'Organic fabricated answer',
            },
          ],
          copilot_answer: {
            organic_result: { snippet: 'Embedded organic fabricated answer' },
            overview: {
              snippet: 'Orbit works.',
              references: [{ title: 'Proof', link: 'https://proof.example/' }],
              facts: [{ label: { text: 'Use:' }, content: { text: 'Team work' } }],
            },
            question_and_answer: {
              title: 'Which tool fits a small team?',
              answer: 'A useful comparison.',
              link: 'https://www.bing.com/images/search?q=comparison',
              sitelinks: [{ title: 'Comparison', link: 'https://comparison.example/' }],
            },
          },
        }),
      ),
    );
    const capture = await captureSerpApiGeo('key', context('bing_copilot'), allow, fetcher);
    const url = requestUrl(fetcher.mock.calls[0]?.[0]);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      engine: 'bing',
      mkt: 'en-US',
      device: 'desktop',
      no_cache: 'true',
    });
    expect(url.searchParams.get('cc')).toBeNull();
    expect(capture.answerText).toContain('Orbit works.');
    expect(capture.answerText).toContain('Team work');
    expect(capture.answerText).toContain('A useful comparison.');
    expect(capture.answerText).toContain('Which tool fits a small team?');
    expect(capture.answerText).not.toContain('fabricated');
    expect(capture.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: 'https://organic.example/', referenceLevel: 'retrieved' }),
        expect.objectContaining({ url: 'https://proof.example/', referenceLevel: 'answer' }),
        expect.objectContaining({ url: 'https://comparison.example/', referenceLevel: 'answer' }),
        expect.objectContaining({
          url: 'https://www.bing.com/images/search?q=comparison',
          referenceLevel: 'retrieved',
        }),
      ]),
    );
  });

  it('preserves documented Bing tabs and their answer sources without importing organic text', async () => {
    const tabs = [
      {
        title: 'Small teams',
        content: 'Orbit supports prompt monitoring.',
        link: 'https://proof.example/',
      },
      {
        title: 'Agencies',
        content: 'Compare reporting needs first.',
        link: 'https://agency.example/',
      },
    ];
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      reply(
        envelope({
          organic_results: [{ link: 'https://organic.example/', snippet: 'Not the AI answer.' }],
          copilot_answer: { tabbed_content: tabs },
        }),
      ),
    );
    const capture = await captureSerpApiGeo('key', context('bing_copilot'), allow, fetcher);
    expect(capture.quality).toBe('complete');
    expect(capture.answerText).toBe(
      'Small teams\nOrbit supports prompt monitoring.\nAgencies\nCompare reporting needs first.',
    );
    expect(capture.sources).toEqual([
      expect.objectContaining({ url: 'https://organic.example/', referenceLevel: 'retrieved' }),
      expect.objectContaining({ url: 'https://proof.example/', referenceLevel: 'answer' }),
      expect.objectContaining({ url: 'https://agency.example/', referenceLevel: 'answer' }),
    ]);
    expect(capture.raw).toMatchObject({ search: { copilot_answer: { tabbed_content: tabs } } });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(['', ' ', undefined])(
    'does not count a Q&A title as a complete answer: %j',
    async (answer) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          reply(
            envelope({ copilot_answer: { question_and_answer: { title: 'A summary.', answer } } }),
          ),
        );
      const capture = await captureSerpApiGeo('key', context('bing_copilot'), allow, fetcher);
      expect(capture.quality).toBe('partial');
    },
  );

  it.each(
    [
      null,
      {},
      [],
      [null],
      [{ title: 'Missing content', link: 'https://proof.example/' }],
      [{ title: 'Empty content', content: ' ', link: 'https://proof.example/' }],
      [{ title: 'Invalid source', content: 'Answer text.', link: 'javascript:alert(1)' }],
    ].map((tabs) => ({ tabs })),
  )(
    'keeps malformed or empty Bing tabs partial even alongside a valid overview: $tabs',
    async ({ tabs }) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        reply(
          envelope({
            copilot_answer: { overview: { snippet: 'Valid overview.' }, tabbed_content: tabs },
          }),
        ),
      );
      const capture = await captureSerpApiGeo('key', context('bing_copilot'), allow, fetcher);
      expect(capture.quality).toBe('partial');
      expect(capture.answerText).toContain('Valid overview.');
      expect(capture.sources.every((source) => source.url.startsWith('https://'))).toBe(true);
    },
  );

  it('retains only retrieved references when Bing has no Copilot feature', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      reply(
        envelope({
          organic_results: [{ link: 'https://orbit.example/', snippet: 'Orbit is best.' }],
        }),
      ),
    );
    const capture = await captureSerpApiGeo('key', context('bing_copilot'), allow, fetcher);
    expect(capture.quality).toBe('no_feature');
    expect(capture.answerText).toBe('');
    expect(capture.sources).toEqual([expect.objectContaining({ referenceLevel: 'retrieved' })]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('never counts a Bing organic-only copilot card as a complete AI answer', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      reply(
        envelope({
          copilot_answer: {
            organic_result: {
              title: 'Orbit',
              snippet: 'Orbit is best.',
              link: 'https://orbit.example/',
            },
          },
        }),
      ),
    );
    const capture = await captureSerpApiGeo('key', context('bing_copilot'), allow, fetcher);
    expect(capture.answerText).toBe('');
    expect(capture.quality).toBe('partial');
  });

  it.each([
    envelope({ error: 'Provider error' }),
    { search_metadata: { id: 's', status: 'Error' }, error: 'Expired token' },
    envelope({ ai_overview: { error: 'Overview unavailable' } }),
  ])('does not interpret provider errors as absent feature', async (raw) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply(raw));
    await expect(captureSerpApiGeo('key', context(), allow, fetcher)).rejects.toBeInstanceOf(
      SerpApiError,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([301, 302, 307, 308])(
    'refuses HTTP %s without forwarding credentials or retrying',
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(null, { status, headers: { Location: 'https://other.example/' } }),
        );
      await expect(captureSerpApiGeo('private', context(), allow, fetcher)).rejects.toMatchObject({
        code: 'SERPAPI_REDIRECT_REFUSED',
        uncertain: true,
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe('manual');
    },
  );

  it('does not retry ambiguous transport and never leaks a key in the thrown error', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('Request api_key=private'));
    await expect(captureSerpApiGeo('private', context(), allow, fetcher)).rejects.toMatchObject({
      code: 'SERPAPI_TRANSPORT_ERROR',
      uncertain: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('bounds response bodies and rejects malformed JSON without retry', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('x'.repeat(512 * 1024 + 1)))
      .mockResolvedValueOnce(new Response('{'));
    await expect(captureSerpApiGeo('key', context(), allow, fetcher)).rejects.toThrow(
      'PROVIDER_RESPONSE_LIMIT',
    );
    await expect(captureSerpApiGeo('key', context(), allow, fetcher)).rejects.toThrow(
      'PROVIDER_MALFORMED_JSON',
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not expose credential-bearing stream exceptions as provider error codes', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('Body read failed: api_key=private'));
      },
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(stream));
    await expect(captureSerpApiGeo('private', context(), allow, fetcher)).rejects.toMatchObject({
      message: 'SERPAPI_BODY_ERROR',
      code: 'SERPAPI_BODY_ERROR',
      uncertain: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('follows a page token when the initial answer blocks are empty', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        reply(envelope({ ai_overview: { text_blocks: [], page_token: 'token' } })),
      )
      .mockResolvedValueOnce(reply(envelope({ ai_overview: overview }, 'second')));
    expect((await captureSerpApiGeo('key', context(), allow, fetcher)).quality).toBe('complete');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('rejects unsupported locale before reserving or fetching', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const before = vi.fn<() => Promise<void>>();
    await expect(
      captureSerpApiGeo('key', { ...context(), languageCode: 'id' }, before, fetcher),
    ).rejects.toThrow('SERPAPI_UNSUPPORTED_LOCALE');
    expect(before).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

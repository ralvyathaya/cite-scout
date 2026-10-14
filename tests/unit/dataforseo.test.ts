import { describe, expect, it, vi } from 'vitest';
import { normalizeDataForSeo } from '../../src/integrations/dataforseo/capture';
import { pollDataForSeo, submitDataForSeo } from '../../src/integrations/dataforseo/client';
import { capturePerplexityGeo } from '../../src/integrations/perplexity/geo';
import { geoSurfaces, type GeoEngine, type GeoRequestContext } from '../../src/shared/geo';

// Synthetic envelopes mirror documented provider fields; they are not live capture evidence.
const context = (engine: GeoEngine): GeoRequestContext => ({
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
  forceWebSearch: engine === 'chatgpt_search',
  brand: { id: 'b', name: 'Orbit', domain: 'orbit.example' },
  competitors: [],
  instructionVersion: 'neutral-research-1',
  maxOutputTokens: 500,
});
const envelope = (result: unknown, status = 20000) => ({
  status_code: 20000,
  cost: 0,
  tasks: [{ id: 'task-1', status_code: status, cost: 0, result }],
});
const reply = (raw: unknown, status = 200) => new Response(JSON.stringify(raw), { status });

describe('DataForSEO actual evidence levels', () => {
  it('uses only top-level overview, keeping raw and text exact', () => {
    const raw = envelope([
      {
        items: [
          { type: 'people_also_ask', items: [{ type: 'ai_overview', markdown: 'Wrong answer' }] },
          { type: 'organic', url: 'https://unused.example/' },
          {
            type: 'ai_overview',
            markdown: 'Orbit is an option.\n',
            references: [{ url: 'https://answer.example/' }],
            items: [
              {
                type: 'ai_overview_element',
                text: 'Orbit is an option.',
                references: [{ url: 'https://element.example/' }],
              },
            ],
          },
        ],
      },
    ]);
    const capture = normalizeDataForSeo(raw, context('google_aio'));
    expect(capture.raw).toBe(raw);
    expect(capture.answerText).toBe('Orbit is an option.\n');
    expect(capture.quality).toBe('complete');
    expect(capture.model).toBeNull();
    expect(capture.sources.map((s) => [s.url, s.referenceLevel])).toEqual([
      ['https://unused.example/', 'retrieved'],
      ['https://answer.example/', 'answer'],
      ['https://element.example/', 'element'],
    ]);
    expect(capture.sources.every((s) => s.spans === undefined)).toBe(true);
  });
  it('reports no feature for a valid SERP without overview, not brand absence', () => {
    expect(normalizeDataForSeo(envelope([{ items: [] }]), context('google_aio')).quality).toBe(
      'no_feature',
    );
  });
  it.each(['google_aio', 'bing_copilot', 'chatgpt_search'] as const)(
    'keeps NoSearchResults unavailable as partial for %s',
    (engine) => {
      const raw = envelope(null, 40102);
      expect(normalizeDataForSeo(raw, context(engine))).toMatchObject({
        quality: 'partial',
        raw,
        answerText: '',
        providerStatus: '40102',
      });
    },
  );
  it('keeps an explicitly partial SERP without overview partial', () => {
    expect(
      normalizeDataForSeo(envelope([{ items: [] }], 40106), context('google_aio')).quality,
    ).toBe('partial');
  });
  it('does not treat missing or malformed items as observed no overview', () => {
    expect(() => normalizeDataForSeo(envelope([{ items: null }]), context('google_aio'))).toThrow(
      'MALFORMED_RESULT',
    );
    expect(() => normalizeDataForSeo(envelope([{ items: [null] }]), context('google_aio'))).toThrow(
      'MALFORMED_RESULT',
    );
  });
  it('marks malformed sources and explicitly partial provider result partial', () => {
    const capture = normalizeDataForSeo(
      envelope(
        [
          {
            items: [
              {
                type: 'ai_overview',
                markdown: 'Answer',
                references: [
                  null,
                  { url: 'javascript:alert(1)' },
                  { url: 'https://valid.example/', title: 1 },
                ],
              },
            ],
          },
        ],
        40106,
      ),
      context('google_aio'),
    );
    expect(capture.answerText).toBe('Answer');
    expect(capture.quality).toBe('partial');
    expect(capture.sources).toHaveLength(1);
  });
  it('keeps unused ChatGPT search hits separate from answer and element sources', () => {
    const raw = envelope([
      {
        model: 'gpt-reported',
        markdown: '[Orbit](https://used.example/) is useful.',
        search_results: [{ url: 'https://unused.example/' }, { url: 'https://used.example/' }],
        sources: [{ url: 'https://used.example/' }, { url: 'https://used.example/' }],
        items: [
          {
            type: 'chat_gpt_text',
            markdown: 'Orbit is useful.',
            sources: [{ url: 'https://used.example/' }],
          },
        ],
      },
    ]);
    const capture = normalizeDataForSeo(raw, context('chatgpt_search'));
    expect(capture.model).toBe('gpt-reported');
    expect(capture.modelReported).toBe(true);
    expect(capture.sources.map((s) => s.referenceLevel)).toEqual([
      'retrieved',
      'retrieved',
      'answer',
      'element',
    ]);
    expect(capture.sources.every((s) => s.spans === undefined)).toBe(true);
  });
  it('retains nested Bing reference levels', () => {
    const capture = normalizeDataForSeo(
      envelope([
        {
          items: [
            {
              type: 'ai_overview',
              markdown: 'Answer',
              references: [{ url: 'https://answer.example/' }],
              items: [
                {
                  type: 'ai_overview_expanded_element',
                  components: [
                    {
                      type: 'ai_overview_expanded_component',
                      text: 'Detail',
                      references: [{ url: 'https://detail.example/' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]),
      context('bing_copilot'),
    );
    expect(capture.sources.map((s) => s.referenceLevel)).toEqual(['answer', 'element']);
  });
  it('keeps empty loaded overview partial and missing ChatGPT model unknown', () => {
    const overview = normalizeDataForSeo(
      envelope([{ items: [{ type: 'ai_overview', markdown: null, items: null }] }]),
      context('google_aio'),
    );
    expect(overview.quality).toBe('partial');
    const chat = normalizeDataForSeo(
      envelope([{ markdown: 'Answer', sources: null, search_results: null }]),
      context('chatgpt_search'),
    );
    expect(chat.quality).toBe('complete');
    expect(chat.model).toBeNull();
    expect(chat.modelReported).toBe(false);
    expect(chat.reportedCost).toBe(0);
  });
});

describe('durable DataForSEO client boundary', () => {
  it('submits neutral literal prompt once with engine capabilities', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply(envelope(null, 20100)));
    const submitted = await submitDataForSeo(
      'login',
      'password',
      context('google_aio'),
      'item-1',
      fetcher,
    );
    expect(submitted.taskId).toBe('task-1');
    const requestBody = fetcher.mock.calls[0]?.[1]?.body;
    const body = JSON.parse(typeof requestBody === 'string' ? requestBody : '') as Record<
      string,
      unknown
    >[];
    expect(body[0]).toMatchObject({
      keyword: 'C%2B%2B%20tools%20at%2050%25%3F',
      load_async_ai_overview: true,
      tag: 'item-1',
    });
    expect(body[0]).not.toHaveProperty('brand');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('polls saved task id, returns pending before capture without POST', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(reply(envelope(null, 40602)))
      .mockResolvedValueOnce(
        reply(
          envelope([
            {
              markdown: 'Answer',
              model: 'gpt-reported',
              sources: null,
              search_results: null,
              items: [],
            },
          ]),
        ),
      );
    expect(
      (await pollDataForSeo('a', 'b', context('chatgpt_search'), 'task-1', fetcher)).status,
    ).toBe('pending');
    const result = await pollDataForSeo('a', 'b', context('chatgpt_search'), 'task-1', fetcher);
    expect(result.status).toBe('captured');
    expect(fetcher.mock.calls.every((call) => call[1]?.method === 'GET')).toBe(true);
  });
  it('rejects HTTP 200 task errors while retaining raw and reported cost', async () => {
    const raw = envelope(null, 40100);
    raw.tasks = raw.tasks.map((task) => ({ ...task, cost: 0.02 }));
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply(raw));
    await expect(
      submitDataForSeo('a', 'b', context('bing_copilot'), 'item', fetcher),
    ).rejects.toMatchObject({ code: 'DATAFORSEO_40100', raw, cost: 0.02, uncertain: false });
  });
  it('does not retry an uncertain transport or malformed accepted submission', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('connection closed after acceptance'));
    await expect(
      submitDataForSeo('a', 'b', context('google_aio'), 'item', transport),
    ).rejects.toMatchObject({ uncertain: true });
    expect(transport).toHaveBeenCalledTimes(1);
    const malformed = vi
      .fn<typeof fetch>()
      .mockResolvedValue(reply({ status_code: 20000, tasks: [] }));
    await expect(
      submitDataForSeo('a', 'b', context('google_aio'), 'item', malformed),
    ).rejects.toMatchObject({ uncertain: true });
  });
  it('bounds response bytes and does not submit again on oversized response', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('x'.repeat(512 * 1024 + 1)));
    await expect(
      submitDataForSeo('a', 'b', context('google_aio'), 'item', fetcher),
    ).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE', uncertain: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not resubmit HTTP failures and exposes bounded retry-after for saved-task recovery', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{}', { status: 429, headers: { 'retry-after': '15' } }));
    await expect(
      pollDataForSeo('a', 'b', context('bing_copilot'), 'task-1', fetcher),
    ).rejects.toMatchObject({ code: 'PROVIDER_HTTP_429', retryAfterSeconds: 15, uncertain: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const failedPost = vi.fn<typeof fetch>().mockResolvedValue(reply({}, 503));
    await expect(
      submitDataForSeo('a', 'b', context('bing_copilot'), 'item', failedPost),
    ).rejects.toMatchObject({ uncertain: true });
    expect(failedPost).toHaveBeenCalledTimes(1);
  });
});

it.each(['POST', 'GET'] as const)(
  'refuses DataForSEO %s redirects without forwarding credentials or retrying',
  async (method) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { Location: 'https://other.example/' } }),
      );
    const request =
      method === 'POST'
        ? submitDataForSeo(
            'private-login',
            'private-password',
            context('google_aio'),
            'item',
            fetcher,
          )
        : pollDataForSeo(
            'private-login',
            'private-password',
            context('google_aio'),
            'task-1',
            fetcher,
          );
    await expect(request).rejects.toMatchObject({
      code: 'PROVIDER_REDIRECT_REFUSED',
      uncertain: method === 'POST',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe('manual');
  },
);

it('Perplexity GEO reuses exact capture, retaining verified marker offsets and unused sources', async () => {
  const raw = {
    id: 'resp-1',
    status: 'completed',
    model: 'reported-model',
    output: [
      {
        type: 'search_results',
        results: [
          { id: 1, url: 'https://used.example/' },
          { id: 2, url: 'https://unused.example/' },
        ],
      },
      { type: 'message', content: [{ type: 'output_text', text: 'Orbit [1].' }] },
    ],
    usage: { input_tokens: 2, output_tokens: 3, cost: { total_cost: 0.01 } },
  };
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply(raw));
  const capture = await capturePerplexityGeo('key', context('perplexity'), fetcher);
  expect(capture.answerText).toBe('Orbit [1].');
  expect(capture.sources.map((s) => s.referenceLevel)).toEqual(['inline_verified', 'retrieved']);
  expect(capture.sources[0]?.spans).toEqual([{ start: 6, end: 9 }]);
  expect(capture.reportedCost).toBe(0.01);
  const requestBody = fetcher.mock.calls[0]?.[1]?.body;
  const request = JSON.parse(typeof requestBody === 'string' ? requestBody : '') as Record<
    string,
    unknown
  >;
  expect(request.input).toBe('C++ tools at 50%?');
});

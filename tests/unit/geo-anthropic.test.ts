import { describe, expect, it, vi } from 'vitest';
import {
  captureAnthropicGeo,
  normalizeAnthropic,
  estimateAnthropicCost,
} from '../../src/integrations/anthropic/geo';
import { geoCollectorPolicy, geoSurfaces, type GeoRequestContext } from '../../src/shared/geo';
import { anthropicReply } from './anthropic-fixture';
import { neutralResearchInstruction } from '../../src/integrations/perplexity/provider';

const context: GeoRequestContext = {
  schemaVersion: 'geo-context-1',
  projectId: 'project',
  contextVersion: 1,
  settingsRevision: 1,
  promptId: 'prompt',
  promptVersionId: 'version',
  promptText: 'Which tools fit a small team?',
  engine: 'claude_web_search',
  ...geoSurfaces.claude_web_search,
  ...geoCollectorPolicy('claude_web_search', 'anthropic_messages'),
  languageCode: 'en',
  locationCode: 2840,
  device: 'desktop',
  forceWebSearch: false,
  brand: { id: 'brand', name: 'OrbitCal', domain: 'orbitcal.test' },
  competitors: [],
  instructionVersion: 'neutral-research-1',
};
describe('Claude synthetic capture', () => {
  it('preserves multiple text blocks and excludes thinking from the displayed answer', () => {
    const raw = anthropicReply();
    const capture = normalizeAnthropic({
      ...raw,
      content: [
        { type: 'thinking', thinking: 'Internal reasoning is not an answer.' },
        ...raw.content,
        { type: 'text', text: 'Second paragraph 😀.', citations: [] },
      ],
    });
    expect(capture.quality).toBe('complete');
    expect(capture.answerText).toBe(
      '**OrbitCal** helps teams. Compare buyer evidence.\nSecond paragraph 😀.',
    );
    expect(capture.textParts.map((part) => part.text)).toEqual([
      '**OrbitCal** helps teams. Compare buyer evidence.',
      'Second paragraph 😀.',
    ]);
  });
  it('sends one bounded neutral request and preserves text, source types, usage and request ID', async () => {
    const raw = {
      ...anthropicReply(),
      debug: { api_key: 'synthetic-secret', text: 'synthetic-secret' },
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(raw, { headers: { 'request-id': 'req-synthetic' } }));
    const capture = await captureAnthropicGeo('synthetic-secret', context, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.anthropic.com/v1/messages');
    const init = fetcher.mock.calls[0]?.[1];
    expect(JSON.parse(typeof init?.body === 'string' ? init.body : '')).toEqual({
      model: 'claude-sonnet-5-5',
      system: neutralResearchInstruction,
      messages: [{ role: 'user', content: context.promptText }],
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 1 }],
      max_tokens: 1600,
      stream: false,
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.redirect).toBe('manual');
    expect(capture).toMatchObject({
      quality: 'complete',
      providerRequestId: 'req-synthetic',
      answerText: '**OrbitCal** helps teams. Compare buyer evidence.',
      inputTokens: 50,
      outputTokens: 30,
      reportedCost: null,
      inlineReferencesAvailable: false,
    });
    expect(capture.sources.map((s) => s.referenceLevel)).toEqual([
      'retrieved',
      'retrieved',
      'answer',
    ]);
    expect(capture.sources.every((s) => s.spans === undefined)).toBe(true);
    expect(JSON.stringify(capture.raw)).not.toContain('synthetic-secret');
    expect(estimateAnthropicCost(capture)).toBeCloseTo(0.0104);
  });
  it.each([
    [
      'no search',
      (raw: ReturnType<typeof anthropicReply>) => ({ ...raw, content: raw.content.slice(2) }),
    ],
    ['empty', (raw: ReturnType<typeof anthropicReply>) => ({ ...raw, content: [] })],
    ['refusal', (raw: ReturnType<typeof anthropicReply>) => ({ ...raw, stop_reason: 'refusal' })],
    [
      'truncated',
      (raw: ReturnType<typeof anthropicReply>) => ({ ...raw, stop_reason: 'max_tokens' }),
    ],
    [
      'pause turn',
      (raw: ReturnType<typeof anthropicReply>) => ({ ...raw, stop_reason: 'pause_turn' }),
    ],
    [
      'tool error in HTTP 200',
      (raw: ReturnType<typeof anthropicReply>) => ({
        ...raw,
        content: [
          raw.content[0],
          {
            type: 'web_search_tool_result',
            tool_use_id: 'search-1',
            content: { type: 'web_search_tool_result_error', error_code: 'unavailable' },
          },
          raw.content[2],
        ],
      }),
    ],
    [
      'unsafe citation',
      (raw: ReturnType<typeof anthropicReply>) => ({
        ...raw,
        content: [
          ...raw.content,
          {
            type: 'text',
            text: 'bad',
            citations: [{ type: 'web_search_result_location', url: 'javascript:alert(1)' }],
          },
        ],
      }),
    ],
  ])('keeps %s partial without continuation', async (_name, modify) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(modify(anthropicReply())));
    const capture = await captureAnthropicGeo('fake', context, fetcher);
    expect(capture.quality).toBe('partial');
    expect(capture.sources.every((s) => s.url.startsWith('https://'))).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('keeps incomplete or unexpected usage unknown rather than zero', () => {
    for (const usage of [
      undefined,
      {},
      { input_tokens: 1, output_tokens: 2 },
      { input_tokens: -1, output_tokens: 2, server_tool_use: { web_search_requests: 0 } },
      { ...anthropicReply().usage, cache_creation_input_tokens: 50 },
      { ...anthropicReply().usage, cache_read_input_tokens: null },
      { ...anthropicReply().usage, cache_creation_input_tokens: null },
    ]) {
      const capture = normalizeAnthropic({ ...anthropicReply(), usage });
      expect(estimateAnthropicCost(capture)).toBeNull();
    }
    expect(
      estimateAnthropicCost({ ...normalizeAnthropic(anthropicReply()), model: 'unknown' }),
    ).toBeNull();
  });
  it('rejects malformed envelopes and HTTP errors with redacted evidence', async () => {
    expect(() => normalizeAnthropic({ content: [] })).toThrow('MALFORMED_RESPONSE');
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ error: 'fake-key' }, { status: 429 }));
    await expect(captureAnthropicGeo('fake-key', context, fetcher)).rejects.toMatchObject({
      code: 'PROVIDER_HTTP_429',
      raw: { error: '[REDACTED]' },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('refuses redirects without forwarding the API key or making a second request', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 307,
        headers: { Location: 'https://other.example/messages' },
      }),
    );
    await expect(captureAnthropicGeo('fake-key', context, fetcher)).rejects.toMatchObject({
      code: 'PROVIDER_HTTP_307',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.anthropic.com/v1/messages');
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe('manual');
  });
  it.each([
    [null, 'EMPTY_BODY'],
    ['', 'MALFORMED_RESPONSE'],
    ['{', 'MALFORMED_RESPONSE'],
  ])('rejects an invalid response body without retry', async (body, code) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(body));
    await expect(captureAnthropicGeo('fake-key', context, fetcher)).rejects.toMatchObject({ code });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('times out once, never retries a lost response, and never calls with an empty key', async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => {
      controller.abort();
      return Promise.reject(new Error('lost'));
    });
    await expect(captureAnthropicGeo('fake', context, fetcher)).rejects.toMatchObject({
      code: 'PROVIDER_TIMEOUT',
    });
    expect(timeout).toHaveBeenCalledWith(30_000);
    timeout.mockRestore();
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(captureAnthropicGeo('', context, fetcher)).rejects.toMatchObject({
      code: 'COLLECTOR_NOT_CONFIGURED',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

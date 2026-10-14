import { describe, expect, it, vi } from 'vitest';
import { captureOpenAiGeo } from '../../src/integrations/openai/geo';
import { neutralResearchInstruction } from '../../src/integrations/perplexity/provider';
import { geoSurfaces, type GeoRequestContext } from '../../src/shared/geo';

const context = (): GeoRequestContext => ({
  schemaVersion: 'geo-context-1',
  projectId: 'project',
  contextVersion: 1,
  settingsRevision: 1,
  promptId: 'prompt',
  promptVersionId: 'prompt-version',
  promptText: 'Which independent analytics tools are suitable for a small team?',
  engine: 'openai_web_search',
  ...geoSurfaces.openai_web_search,
  collectorVersion: 'geo-collector-1',
  languageCode: 'en',
  locationCode: 2840,
  device: 'desktop',
  forceWebSearch: true,
  brand: { id: 'brand', name: 'Orbit', domain: 'orbit.example' },
  competitors: [],
  instructionVersion: 'neutral-research-1',
  maxOutputTokens: 500,
});

// Synthetic Responses envelopes exercise the documented contract, not live monitoring evidence.
const citation = (url = 'https://used.example/', start = 6, end = 9) => ({
  type: 'url_citation',
  url,
  title: 'An independent source',
  start_index: start,
  end_index: end,
});
const message = (text = 'Orbit [1].', annotations: unknown = [citation()]) => ({
  type: 'message',
  status: 'completed',
  role: 'assistant',
  content: [{ type: 'output_text', text, annotations }],
});
const envelope = (output: unknown[] = [message()], status = 'completed') => ({
  id: 'resp-synthetic',
  model: 'gpt-6-luna-reported',
  status,
  output: [
    {
      type: 'web_search_call',
      status: 'completed',
      action: {
        type: 'search',
        query: 'independent analytics tools',
        sources: [
          { type: 'url', url: 'https://used.example/' },
          { type: 'url', url: 'https://unused.example/' },
        ],
      },
    },
    ...output,
  ],
  usage: { input_tokens: 12, output_tokens: 9, total_tokens: 21 },
  error: null,
});
const reply = (raw: unknown, status = 200) => new Response(JSON.stringify(raw), { status });

describe('OpenAI Web Search API capture', () => {
  it('sends one fresh, bounded, neutral Responses request without brand context', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply(envelope()));
    const capture = await captureOpenAiGeo('synthetic-key', context(), fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.openai.com/v1/responses');
    const init = fetcher.mock.calls[0]?.[1];
    const body = JSON.parse(typeof init?.body === 'string' ? init.body : '') as unknown;
    expect(body).toEqual({
      model: 'gpt-6-luna',
      instructions: neutralResearchInstruction,
      input: context().promptText,
      tools: [{ type: 'web_search', external_web_access: true }],
      tool_choice: 'required',
      max_tool_calls: 1,
      include: ['web_search_call.action.sources'],
      reasoning: { effort: 'none' },
      max_output_tokens: 500,
      store: false,
      stream: false,
    });
    expect(init?.headers).toEqual({
      Authorization: 'Bearer synthetic-key',
      'Content-Type': 'application/json',
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(capture).toMatchObject({
      model: 'gpt-6-luna-reported',
      modelReported: true,
      providerRequestId: 'resp-synthetic',
      providerStatus: 'completed',
      inputTokens: 12,
      outputTokens: 9,
      reportedCost: null,
      quality: 'complete',
    });
  });

  it('uses the frozen requested model rather than inferring it from a response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply(envelope()));
    await captureOpenAiGeo('key', context(), fetcher, 'gpt-frozen');
    expect(fetcher.mock.calls[0]?.[1]?.body).toContain('"model":"gpt-frozen"');
  });

  it('keeps multipart answer boundaries and shifts verified citation spans only for display', async () => {
    const raw = envelope([
      {
        ...message(),
        content: [
          { type: 'output_text', text: 'Orbit [1].', annotations: [citation()] },
          {
            type: 'output_text',
            text: 'A second [2].\n',
            annotations: [citation('https://used.example/', 9, 12)],
          },
        ],
      },
      message('Third [3].', [citation('https://third.example/', 6, 9)]),
    ]);
    const capture = await captureOpenAiGeo(
      'key',
      context(),
      vi.fn<typeof fetch>().mockResolvedValue(reply(raw)),
    );
    expect(capture.raw).toEqual(raw);
    expect(capture.answerText).toBe('Orbit [1].\nA second [2].\n\nThird [3].');
    expect(capture.textParts).toEqual([
      { itemIndex: 1, contentIndex: 0, text: 'Orbit [1].' },
      { itemIndex: 1, contentIndex: 1, text: 'A second [2].\n' },
      { itemIndex: 2, contentIndex: 0, text: 'Third [3].' },
    ]);
    const used = capture.sources.find(
      (source) =>
        source.url === 'https://used.example/' && source.referenceLevel === 'inline_verified',
    );
    expect(used?.spans).toEqual([
      { start: 6, end: 9 },
      { start: 20, end: 23 },
    ]);
    expect(
      capture.sources.find((source) => source.url === 'https://third.example/')?.spans,
    ).toEqual([{ start: 32, end: 35 }]);
    expect(
      capture.sources.filter((source) => source.referenceLevel === 'retrieved').map((s) => s.url),
    ).toEqual(['https://used.example/', 'https://unused.example/']);
    expect(capture.inlineReferencesAvailable).toBe(true);
  });

  it('retains incomplete output as partial evidence with its actual token usage', async () => {
    const raw = {
      ...envelope([message()], 'incomplete'),
      incomplete_details: { reason: 'max_output_tokens' },
    };
    const capture = await captureOpenAiGeo(
      'key',
      context(),
      vi.fn<typeof fetch>().mockResolvedValue(reply(raw)),
    );
    expect(capture).toMatchObject({
      quality: 'partial',
      answerText: 'Orbit [1].',
      outputTokens: 9,
    });
    expect(capture.raw).toEqual(raw);
  });

  it.each([
    { ...citation(), start_index: -1 },
    { ...citation(), start_index: 6.5 },
    { ...citation(), end_index: 100 },
    { ...citation(), end_index: 6 },
    { ...citation(), url: 'javascript:alert(1)' },
    { ...citation(), url: 'https://user:password@used.example/' },
    { ...citation(), type: 'unsupported_citation' },
    null,
  ])(
    'marks invalid annotations partial without inventing a verified source: %j',
    async (annotation) => {
      const capture = await captureOpenAiGeo(
        'key',
        context(),
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(reply(envelope([message('Orbit [1].', [annotation])]))),
      );
      expect(capture.quality).toBe('partial');
      expect(capture.answerText).toBe('Orbit [1].');
      expect(capture.inlineReferencesAvailable).toBe(false);
      expect(capture.sources.every((source) => source.referenceLevel === 'retrieved')).toBe(true);
    },
  );

  it('keeps missing completed search evidence partial', async () => {
    const raw = { ...envelope(), output: [message('No search', [])] };
    const capture = await captureOpenAiGeo(
      'key',
      context(),
      vi.fn<typeof fetch>().mockResolvedValue(reply(raw)),
    );
    expect(capture.quality).toBe('partial');
    expect(capture.sources).toEqual([]);
  });

  it('does not infer citations when annotations are missing', async () => {
    const raw = envelope([
      { ...message(), content: [{ type: 'output_text', text: 'Orbit [1].' }] },
    ]);
    const capture = await captureOpenAiGeo(
      'key',
      context(),
      vi.fn<typeof fetch>().mockResolvedValue(reply(raw)),
    );
    expect(capture.quality).toBe('partial');
    expect(capture.inlineReferencesAvailable).toBe(false);
    expect(capture.sources.every((source) => source.referenceLevel === 'retrieved')).toBe(true);
  });

  it('does not verify a citation span that splits a Unicode surrogate pair', async () => {
    const raw = envelope([message('😀 Orbit [1].', [citation('https://used.example/', 1, 5)])]);
    const capture = await captureOpenAiGeo(
      'key',
      context(),
      vi.fn<typeof fetch>().mockResolvedValue(reply(raw)),
    );
    expect(capture.quality).toBe('partial');
    expect(capture.answerText).toBe('😀 Orbit [1].');
    expect(capture.inlineReferencesAvailable).toBe(false);
  });

  it('keeps invalid retrieved source records and invalid token usage partial', async () => {
    const raw = envelope();
    raw.output[0] = {
      type: 'web_search_call',
      status: 'completed',
      action: { type: 'search', sources: [{ url: 'javascript:alert(1)' }] },
    };
    raw.usage.input_tokens = 1.5;
    const capture = await captureOpenAiGeo(
      'key',
      context(),
      vi.fn<typeof fetch>().mockResolvedValue(reply(raw)),
    );
    expect(capture.quality).toBe('partial');
    expect(capture.inputTokens).toBeNull();
    expect(capture.reportedCost).toBeNull();
  });

  it.each([{}, { ...envelope(), output: null }, { ...envelope(), model: '' }])(
    'rejects malformed envelopes without repeating the paid request',
    async (raw) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply(raw));
      await expect(captureOpenAiGeo('key', context(), fetcher)).rejects.toMatchObject({
        code: 'MALFORMED_RESPONSE',
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects provider failure and preserves the error envelope', async () => {
    const raw = { ...envelope([], 'failed'), error: { code: 'server_error' } };
    await expect(
      captureOpenAiGeo('key', context(), vi.fn<typeof fetch>().mockResolvedValue(reply(raw))),
    ).rejects.toMatchObject({ code: 'OPENAI_FAILED', raw, providerStatus: 'failed' });
  });

  it.each([429, 503])('does not retry HTTP %i', async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply({ error: {} }, status));
    await expect(captureOpenAiGeo('key', context(), fetcher)).rejects.toMatchObject({
      code: `PROVIDER_HTTP_${String(status)}`,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('bounds response bytes and rejects invalid JSON without retry', async () => {
    for (const [body, code] of [
      ['x'.repeat(128 * 1024 + 1), 'RESPONSE_TOO_LARGE'],
      ['{invalid', 'MALFORMED_RESPONSE'],
    ]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(body));
      await expect(captureOpenAiGeo('key', context(), fetcher)).rejects.toMatchObject({ code });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });

  it('does not retry an ambiguous transport failure', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('Connection closed'));
    await expect(captureOpenAiGeo('key', context(), fetcher)).rejects.toMatchObject({
      code: 'PROVIDER_TRANSPORT_ERROR',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not retry an aborted request and returns a stable timeout code', async () => {
    const controller = new AbortController();
    controller.abort();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    try {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockRejectedValue(new Error('Sensitive transport detail'));
      await expect(captureOpenAiGeo('key', context(), fetcher)).rejects.toMatchObject({
        code: 'PROVIDER_TIMEOUT',
        message: 'PROVIDER_TIMEOUT',
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      timeout.mockRestore();
    }
  });
});

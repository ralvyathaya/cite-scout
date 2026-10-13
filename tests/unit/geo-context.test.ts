import { describe, expect, it } from 'vitest';
import { geoPayloadHash, geoRunRequestSchema, geoSurfaces } from '../../src/shared/geo';

describe('GEO request identity', () => {
  it('allows the OpenAI API surface while retaining a four-engine run limit', () => {
    const requestId = '85c8d620-b09b-4a38-9dfd-5db653f5f083';
    expect(
      geoRunRequestSchema.safeParse({ requestId, engines: ['openai_web_search'] }).success,
    ).toBe(true);
    expect(
      geoRunRequestSchema.safeParse({
        requestId,
        engines: [
          'perplexity',
          'openai_web_search',
          'google_aio',
          'bing_copilot',
          'chatgpt_search',
        ],
      }).success,
    ).toBe(false);
    expect(Object.keys(geoSurfaces)).toHaveLength(5);
  });
  it('rejects repeated engines and prompt ids before accepting work', () => {
    const requestId = '85c8d620-b09b-4a38-9dfd-5db653f5f083';
    expect(
      geoRunRequestSchema.safeParse({ requestId, engines: ['perplexity', 'perplexity'] }).success,
    ).toBe(false);
    expect(geoRunRequestSchema.safeParse({ requestId, promptIds: ['one', 'one'] }).success).toBe(
      false,
    );
    expect(geoRunRequestSchema.safeParse({ requestId: 'double-click' }).success).toBe(false);
  });

  it('hashes selections independently of order and detects changed payload', async () => {
    const requestId = '85c8d620-b09b-4a38-9dfd-5db653f5f083';
    const first = {
      requestId,
      promptIds: ['one', 'two'],
      engines: ['perplexity', 'google_aio'] as const,
    };
    expect(
      await geoPayloadHash({ ...first, engines: [...first.engines], promptIds: first.promptIds }),
    ).toBe(
      await geoPayloadHash({
        requestId,
        promptIds: ['two', 'one'],
        engines: ['google_aio', 'perplexity'],
      }),
    );
    expect(
      await geoPayloadHash({ requestId, promptIds: ['one'], engines: ['perplexity'] }),
    ).not.toBe(await geoPayloadHash({ ...first, engines: [...first.engines] }));
  });

  it('labels Bing answers separately from the Copilot chat application', () => {
    expect(geoSurfaces.bing_copilot.surface).toBe('bing_copilot_answers');
    expect(geoSurfaces.chatgpt_search.collector).toBe('dataforseo_standard');
  });
});

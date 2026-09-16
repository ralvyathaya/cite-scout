import { describe, expect, it, vi } from 'vitest';
import {
  neutralResearchInstruction,
  PerplexityProvider,
} from '../../src/integrations/perplexity/provider';

describe('Perplexity Agent API provider', () => {
  it('preserves the user prompt without injecting tracked entities and extracts citations', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'resp_1',
          status: 'completed',
          model: 'test/model',
          output: [
            { type: 'search_results', results: [{ id: 1, url: 'https://example.com' }] },
            { type: 'message', content: [{ type: 'output_text', text: 'An answer [1].' }] },
          ],
          usage: { input_tokens: 2, output_tokens: 3 },
        }),
        { status: 200 },
      ),
    );
    const provider = new PerplexityProvider('secret', fetcher);
    const prompt = 'Best tool for consultants?';
    const result = await provider.runObservation({
      prompt,
      neutralInstruction: neutralResearchInstruction,
      maxOutputTokens: 500,
    });
    const init = fetcher.mock.calls[0]?.[1];
    expect(typeof init?.body).toBe('string');
    const requestBody = typeof init?.body === 'string' ? init.body : '';
    expect(requestBody).toContain(prompt);
    expect(requestBody).not.toContain('OrbitCal');
    expect(result.citations).toHaveLength(1);
    expect(result.inputTokens).toBe(2);
  });
  it('retries 429 with a bounded attempt count', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 429 }));
    const provider = new PerplexityProvider('secret', fetcher);
    await expect(
      provider.runObservation({
        prompt: 'x',
        neutralInstruction: neutralResearchInstruction,
        maxOutputTokens: 10,
      }),
    ).rejects.toThrow('PERPLEXITY_HTTP_429');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});

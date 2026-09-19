import { z } from 'zod';

export const citationSchema = z.object({
  id: z.number(),
  url: z.url(),
  title: z.string().optional(),
  snippet: z.string().optional(),
});
const usageSchema = z.looseObject({
  input_tokens: z.number().int().nonnegative().optional(),
  output_tokens: z.number().int().nonnegative().optional(),
  total_tokens: z.number().int().nonnegative().optional(),
});
const responseSchema = z.looseObject({
  id: z.string(),
  status: z.enum(['completed', 'failed', 'incomplete', 'in_progress', 'queued', 'cancelled']),
  model: z.string(),
  output: z.array(z.looseObject({ type: z.string() })),
  usage: usageSchema.optional(),
  error: z
    .object({ message: z.string(), code: z.string().optional(), type: z.string().optional() })
    .optional(),
});

export interface ObservationRequest {
  prompt: string;
  neutralInstruction: string;
  maxOutputTokens: number;
}
export interface Observation {
  text: string;
  citations: z.infer<typeof citationSchema>[];
  providerRequestId: string;
  model: string;
  preset: string;
  inputTokens: number | null;
  outputTokens: number | null;
}
export interface ObservationProvider {
  runObservation(request: ObservationRequest): Promise<Observation>;
}

export const neutralResearchInstruction =
  'Answer as an independent product researcher. Give a concise list of relevant options and explain each briefly. Use current web sources where available.';

export class PerplexityProvider implements ObservationProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async runObservation(request: ObservationRequest): Promise<Observation> {
    const response = await this.fetchWithRetry({
      input: request.prompt,
      instructions: request.neutralInstruction,
      preset: 'fast',
      max_output_tokens: request.maxOutputTokens,
      stream: false,
    });
    const body = responseSchema.parse(await response.json());
    if (body.status !== 'completed')
      throw new Error(body.error?.code ?? `PERPLEXITY_${body.status.toUpperCase()}`);
    const messageSchema = z.object({
      type: z.literal('message'),
      content: z.array(z.object({ type: z.literal('output_text'), text: z.string() })),
    });
    const searchSchema = z.object({
      type: z.literal('search_results'),
      results: z.array(citationSchema),
    });
    const text = body.output
      .flatMap((item) => {
        const parsed = messageSchema.safeParse(item);
        return parsed.success ? parsed.data.content.map((content) => content.text) : [];
      })
      .join('\n')
      .trim();
    const citations = body.output.flatMap((item) => {
      const parsed = searchSchema.safeParse(item);
      return parsed.success ? parsed.data.results : [];
    });
    if (!text) throw new Error('PERPLEXITY_EMPTY_RESPONSE');
    return {
      text,
      citations,
      providerRequestId: body.id,
      model: body.model,
      preset: 'fast',
      inputTokens: body.usage?.input_tokens ?? null,
      outputTokens: body.usage?.output_tokens ?? null,
    };
  }
  private async fetchWithRetry(body: unknown): Promise<Response> {
    // NOTE: invoke the fetcher unbound. Web API `fetch` implementations
    // (workerd, undici) throw "Illegal invocation" when called as a method of
    // another object (`this.fetcher(...)`), so destructure it first.
    const fetcher = this.fetcher;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetcher('https://api.perplexity.ai/v1/agent', {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30_000),
        });
        if (response.ok) return response;
        if (![408, 429, 500, 502, 503, 504].includes(response.status))
          throw new Error(`PERPLEXITY_HTTP_${String(response.status)}`);
        if (attempt === 2) throw new Error(`PERPLEXITY_HTTP_${String(response.status)}`);
        await new Promise((resolve) => setTimeout(resolve, Math.min(2_000, 250 * 2 ** attempt)));
      } catch (error) {
        if (
          attempt === 2 ||
          (error instanceof Error &&
            error.message.startsWith('PERPLEXITY_HTTP_4') &&
            !error.message.endsWith('408') &&
            !error.message.endsWith('429'))
        )
          throw error;
        await new Promise((resolve) => setTimeout(resolve, Math.min(2_000, 250 * 2 ** attempt)));
      }
    }
    throw new Error('PERPLEXITY_UNAVAILABLE');
  }
}

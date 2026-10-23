import { z } from 'zod';

const usd = z.number().positive().max(1_000_000).multipleOf(0.000001);
const policySchema = z
  .object({
    version: z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/),
    globalMonthlyUsd: usd,
    projectMonthlyUsd: usd,
    globalMonthlyRequests: z.number().int().positive().max(1_000_000),
    projectMonthlyRequests: z.number().int().positive().max(1_000_000),
    serpapiEstimatedCostUsd: usd.optional(),
    requestCeilingsUsd: z
      .object({
        perplexity_api: usd,
        openai_responses: usd,
        serpapi: usd,
        workers_ai: usd,
        typesafe: usd,
        dataforseo_standard: usd,
      })
      .partial()
      .strict(),
  })
  .strict()
  .refine((policy) => Object.keys(policy.requestCeilingsUsd).length > 0)
  .refine(
    (policy) =>
      policy.serpapiEstimatedCostUsd === undefined ||
      (policy.requestCeilingsUsd.serpapi !== undefined &&
        policy.serpapiEstimatedCostUsd <= policy.requestCeilingsUsd.serpapi),
  );

export function readProductionCostPolicy(value: string) {
  try {
    const result = policySchema.safeParse(JSON.parse(value) as unknown);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

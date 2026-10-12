import {
  nativeDecisionSchema,
  type DecisionModel,
  type GeoEvaluation,
  type NativeDecision,
} from '../../shared/geo-analysis';

export function validateDecision(
  raw: unknown,
  evaluation: GeoEvaluation,
  model: DecisionModel,
): NativeDecision {
  const parsed = nativeDecisionSchema.parse(raw);
  if (parsed.model.trim() !== model) throw new Error('CLASSIFIER_MODEL_MISMATCH');
  const expected = Object.keys(evaluation.questions).sort(),
    actual = Object.keys(parsed.answers).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('CLASSIFIER_ANSWER_IDS');
  for (const [id, question] of Object.entries(evaluation.questions)) {
    const answer = parsed.answers[id];
    if (answer?.type !== question.type) throw new Error('CLASSIFIER_ANSWER_TYPE');
    if (question.type === 'choice' && answer.type === 'choice') {
      const options = Object.keys(question.criteria).sort();
      if (
        !options.includes(answer.choice) ||
        JSON.stringify(options) !== JSON.stringify(Object.keys(answer.probabilities).sort()) ||
        Math.abs(Object.values(answer.probabilities).reduce((sum, p) => sum + p, 0) - 1) > 0.01
      )
        throw new Error('CLASSIFIER_OPTIONS');
      if (
        (answer.probabilities[answer.choice] ?? -1) <
        Math.max(...Object.values(answer.probabilities))
      )
        throw new Error('CLASSIFIER_WINNER');
    }
  }
  return parsed;
}
export interface DecisionBindings {
  AI?: { run: (model: string, input: Record<string, unknown>) => Promise<unknown> };
  TYPESAFE_API_KEY?: string;
}
export async function evaluateDecision(
  env: DecisionBindings,
  evaluation: GeoEvaluation,
  model: DecisionModel = 'clef-flash',
  fetcher: typeof fetch = fetch,
): Promise<NativeDecision> {
  const input = { model, state: evaluation.state, questions: evaluation.questions };
  if (
    new TextEncoder().encode(JSON.stringify(input)).length > 20000 ||
    Object.keys(evaluation.questions).length > 64
  )
    throw new Error('CLASSIFIER_INPUT_LIMIT');
  let raw: unknown;
  if (model === 'jev-1.13.0') {
    if (!env.TYPESAFE_API_KEY) throw new Error('CLASSIFIER_UNAVAILABLE');
    const response = await fetcher('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${env.TYPESAFE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`CLASSIFIER_HTTP_${String(response.status)}`);
    raw = await readProviderJson(response);
  } else {
    if (!env.AI) throw new Error('CLASSIFIER_UNAVAILABLE');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      raw = await Promise.race([
        env.AI.run(`@cf/cloudflare/${model}`, input),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error('CLASSIFIER_TIMEOUT'));
          }, 10000);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    if (new TextEncoder().encode(JSON.stringify(raw)).length > 128 * 1024)
      throw new Error('CLASSIFIER_RESPONSE_LIMIT');
  }
  return validateDecision(raw, evaluation, model);
}
import { readProviderJson } from '../read-response';

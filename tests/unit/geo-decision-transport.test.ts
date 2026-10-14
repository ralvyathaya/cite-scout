import { describe, expect, it, vi } from 'vitest';
import { evaluateDecision } from '../../src/integrations/decision/client';
import type { GeoEvaluation } from '../../src/shared/geo-analysis';

const evaluation: GeoEvaluation = {
  state: { answerText: 'Orbit is recommended.', brand: 'Orbit' },
  questions: {
    brand_presence: {
      type: 'choice',
      instructions: 'Identify whether the brand appears in this answer.',
      criteria: { present: 'The named brand appears.', absent: 'The named brand does not appear.' },
    },
    evidence_support: { type: 'noul', instructions: 'The answer supports the recommendation.' },
  },
  candidates: [],
  scope: 'complete',
};
const native = {
  model: 'jev-1.13.0',
  usage: { input_tokens: 120, output_tokens: 0 },
  answers: {
    brand_presence: {
      type: 'choice',
      choice: 'present',
      confidence: 0.9,
      probabilities: { present: 0.9, absent: 0.1 },
    },
    evidence_support: { type: 'noul', noul: 0.7 },
  },
};

describe('optional Jev transport with synthetic responses', () => {
  it('posts only the native evaluation with a server-side bearer and validates the native response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(native));
    expect(
      await evaluateDecision(
        { TYPESAFE_API_KEY: 'fake-test-token' },
        evaluation,
        'jev-1.13.0',
        fetcher,
      ),
    ).toEqual(native);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const call = fetcher.mock.calls[0];
    if (!call) throw new Error('Expected a mocked Jev request');
    const [url, request] = call;
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(request).toMatchObject({
      method: 'POST',
      redirect: 'manual',
      headers: {
        Authorization: 'Bearer fake-test-token',
        'Content-Type': 'application/json',
      },
    });
    if (typeof request?.body !== 'string') throw new Error('Expected serialized request body');
    expect(JSON.parse(request.body)).toEqual({
      model: 'jev-1.13.0',
      state: evaluation.state,
      questions: evaluation.questions,
    });
    expect(request.signal).toBeInstanceOf(AbortSignal);
    expect(request.signal?.aborted).toBe(false);
  });
  it('fails unavailable before transport when the optional secret is absent', async () => {
    const fetcher = vi.fn();
    await expect(evaluateDecision({}, evaluation, 'jev-1.13.0', fetcher)).rejects.toThrow(
      'CLASSIFIER_UNAVAILABLE',
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    {
      name: 'redirect',
      response: () =>
        new Response(null, { status: 302, headers: { Location: 'https://other.example/' } }),
      error: 'CLASSIFIER_HTTP_302',
    },
    {
      name: 'HTTP failure',
      response: () => new Response('Rate limited', { status: 429 }),
      error: 'CLASSIFIER_HTTP_429',
    },
    {
      name: 'malformed JSON',
      response: () => new Response('{invalid'),
      error: 'PROVIDER_MALFORMED_JSON',
    },
    {
      name: 'wrong native model',
      response: () => Response.json({ ...native, model: 'clef-flash' }),
      error: 'CLASSIFIER_MODEL_MISMATCH',
    },
    {
      name: 'missing native answers',
      response: () => Response.json({ ...native, answers: {} }),
      error: 'CLASSIFIER_ANSWER_IDS',
    },
  ])('rejects $name without retrying a paid request', async ({ response, error }) => {
    const fetcher = vi.fn().mockResolvedValue(response());
    await expect(
      evaluateDecision({ TYPESAFE_API_KEY: 'fake-test-token' }, evaluation, 'jev-1.13.0', fetcher),
    ).rejects.toThrow(error);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

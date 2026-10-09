import { analyzeEvidence } from '../../domain/evidence';
import { CaptureError } from '../../shared/evidence';
import type { EvidenceCapture, RequestContext } from '../../shared/evidence';

const envelopeLimit = 512 * 1024;
const diagnosticLimit = 4 * 1024;

function diagnostic(bytes: Uint8Array, truncated: boolean): { prefix: string; truncated: boolean } {
  // Decode only complete UTF-8 sequences so replacement characters cannot exceed the byte budget.
  const prefix = new TextDecoder().decode(bytes.subarray(0, diagnosticLimit), { stream: true });
  return { prefix, truncated: truncated || bytes.length > diagnosticLimit };
}

export async function captureEvidence(
  apiKey: string,
  context: RequestContext,
  fetcher: typeof fetch = fetch,
): Promise<EvidenceCapture> {
  const signal = AbortSignal.timeout(30_000);
  let response: Response;
  try {
    response = await fetcher('https://api.perplexity.ai/v1/agent', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: context.text,
        instructions: context.instruction,
        preset: context.preset,
        stream: false,
        max_output_tokens: context.maxOutputTokens,
      }),
      signal,
    });
  } catch {
    throw new CaptureError(signal.aborted ? 'PROVIDER_TIMEOUT' : 'PROVIDER_TRANSPORT_ERROR');
  }
  if (!response.body)
    throw new CaptureError(response.ok ? 'EMPTY_BODY' : `PROVIDER_HTTP_${String(response.status)}`);
  const reader = response.body.getReader();
  const bytes = new Uint8Array(envelopeLimit);
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (length + chunk.value.length > envelopeLimit) {
        bytes.set(chunk.value.subarray(0, envelopeLimit - length), length);
        await reader.cancel();
        throw new CaptureError('RESPONSE_TOO_LARGE', null, null, diagnostic(bytes, true));
      }
      bytes.set(chunk.value, length);
      length += chunk.value.length;
    }
  } catch (error) {
    if (error instanceof CaptureError) throw error;
    throw new CaptureError(
      signal.aborted ? 'PROVIDER_TIMEOUT' : 'PROVIDER_BODY_ERROR',
      null,
      null,
      diagnostic(bytes.subarray(0, length), true),
    );
  } finally {
    reader.releaseLock();
  }
  const body = bytes.subarray(0, length);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as unknown;
  } catch {
    throw new CaptureError(
      response.ok ? 'MALFORMED_RESPONSE' : `PROVIDER_HTTP_${String(response.status)}`,
      null,
      null,
      diagnostic(body, false),
    );
  }
  if (!response.ok) throw new CaptureError(`PROVIDER_HTTP_${String(response.status)}`, null, raw);
  return analyzeEvidence(raw, context);
}

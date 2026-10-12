export async function readProviderJson(
  response: Response,
  maxBytes = 128 * 1024,
): Promise<unknown> {
  if (!response.body) throw new Error('PROVIDER_EMPTY_BODY');
  const reader = response.body.getReader(),
    bytes = new Uint8Array(maxBytes);
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (size + chunk.value.length > maxBytes) {
        await reader.cancel();
        throw new Error('PROVIDER_RESPONSE_LIMIT');
      }
      bytes.set(chunk.value, size);
      size += chunk.value.length;
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size)),
    ) as unknown;
  } catch {
    throw new Error('PROVIDER_MALFORMED_JSON');
  }
}

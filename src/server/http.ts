import type { Context } from 'hono';
import type { Auth } from './auth';

export async function requireSession(c: Context<{ Bindings: CloudflareBindings }>, auth: Auth) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return null;
  return session;
}

export class BodyTooLargeError extends Error {
  override readonly name = 'BodyTooLargeError';
}

/**
 * Reads a JSON body with a hard size ceiling. The size is enforced from the
 * declared content length and again from the decoded bytes, so a client cannot
 * bypass the limit by omitting or understating the header.
 */
export async function readJson(request: Request, maxBytes = 16_384): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError();

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) throw new BodyTooLargeError();

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    // Let each route's input schema report a validation error for malformed or empty JSON.
    return undefined;
  }
}

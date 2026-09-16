import type { Context } from 'hono';
import type { Auth } from './auth';

export async function requireSession(c: Context<{ Bindings: CloudflareBindings }>, auth: Auth) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return null;
  return session;
}

export async function readJsonLimited(request: Request, maxBytes = 16_384): Promise<unknown> {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (length > maxBytes) throw new Error('BODY_TOO_LARGE');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) throw new Error('BODY_TOO_LARGE');
  return JSON.parse(raw) as unknown;
}

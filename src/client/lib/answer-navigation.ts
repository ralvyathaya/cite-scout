import { geoEngineSchema } from '../../shared/geo';

export function answerQuery(params: URLSearchParams) {
  const query = new URLSearchParams();
  const days = params.get('days');
  if (days && ['7', '14', '30'].includes(days)) query.set('days', days);
  const engine = geoEngineSchema.safeParse(params.get('engine'));
  if (engine.success) query.set('engine', engine.data);
  for (const key of ['promptId', 'cursor']) {
    const value = params.get(key);
    if (value && value.length <= (key === 'cursor' ? 1024 : 100)) query.set(key, value);
  }
  return query.toString();
}

export function answerReturnTo(state: unknown): string | null {
  if (
    !state ||
    typeof state !== 'object' ||
    !('returnTo' in state) ||
    typeof state.returnTo !== 'string'
  )
    return null;
  const target = state.returnTo;
  if (target.length > 4096 || !target.startsWith('/') || target.startsWith('//')) return null;
  try {
    const url = new URL(target, 'https://workspace.local');
    return url.origin === 'https://workspace.local' &&
      ['/app/sources', '/app/observations', '/app/competitors', '/app/diagnoses'].includes(
        url.pathname,
      )
      ? url.pathname + url.search
      : null;
  } catch {
    return null;
  }
}

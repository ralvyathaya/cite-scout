export function safeRedirect(
  value: string | undefined,
  appUrl: string,
  fallback = '/app/overview',
): string {
  const origin = new URL(appUrl);
  if (!value) return new URL(fallback, origin).toString();
  const candidate = new URL(value, origin);
  if (candidate.origin !== origin.origin) return new URL(fallback, origin).toString();
  return candidate.toString();
}

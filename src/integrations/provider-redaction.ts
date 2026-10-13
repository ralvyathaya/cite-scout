const credentialName = (name: string) =>
  /(?:apikey|authorization|password|secret|credentials?|accesstoken|refreshtoken|idtoken|clientsecret|pagetoken|cookie|setcookie)$/u.test(
    name.toLowerCase().replace(/[^a-z0-9]/gu, ''),
  ) || name.toLowerCase() === 'token';

export function redactProviderData(value: unknown, secrets: readonly string[] = []): unknown {
  const variants = [
    ...new Set(
      secrets
        .filter(Boolean)
        .flatMap((secret) => [
          secret,
          encodeURIComponent(secret),
          encodeURIComponent(encodeURIComponent(secret)),
          new URLSearchParams({ value: secret }).toString().slice(6),
        ]),
    ),
  ].sort((left, right) => right.length - left.length);
  const redactText = (text: string) => {
    for (const secret of variants) text = text.replaceAll(secret, '[REDACTED]');
    return text
      .replace(
        /((?:\b|%26|%3f|%2526|%253f)(?:api[_-]?key|access[_-]?token|refresh[_-]?token|page[_-]?token|password|client[_-]?secret)(?:=|%3d|%253d))(?:(?!%26|%2526)[^&\s"'<>])+/giu,
        '$1[REDACTED]',
      )
      .replace(
        /\bAuthorization\s*:\s*(?:Bearer|Basic)\s+[^\s"'<>]+/giu,
        'Authorization: [REDACTED]',
      )
      .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/giu, '$1[REDACTED]@');
  };
  const visit = (item: unknown, depth: number): unknown => {
    // Provider JSON is untrusted; truncate excessive nesting rather than overflowing redaction.
    if (depth > 32) return '[REDACTED]';
    if (typeof item === 'string') return redactText(item);
    if (item instanceof Error)
      return { name: redactText(item.name), message: redactText(item.message) };
    if (Array.isArray(item)) return item.map((entry: unknown) => visit(entry, depth + 1));
    if (typeof item === 'object' && item !== null)
      return Object.fromEntries(
        Object.entries(item)
          .filter(([name]) => !credentialName(name))
          .map(([name, entry]) => [redactText(name), visit(entry, depth + 1)]),
      );
    return item;
  };
  return visit(value, 0);
}

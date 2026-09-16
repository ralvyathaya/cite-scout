export function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeDomain(value: string): string {
  const input = value.trim().toLocaleLowerCase('en-US');
  if (!input) throw new Error('Domain is required.');
  let url: URL;
  try {
    url = new URL(input.includes('://') ? input : `https://${input}`);
  } catch {
    throw new Error('Enter a valid domain.');
  }
  const hostname = url.hostname.replace(/^www\./, '').replace(/\.$/, '');
  if (!hostname.includes('.') || hostname.includes('..')) throw new Error('Enter a valid domain.');
  return hostname;
}

export function utcDate(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

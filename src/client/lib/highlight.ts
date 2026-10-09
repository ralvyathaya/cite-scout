export function highlight(text: string, terms: string[]): { text: string; marked: boolean }[] {
  const usable = terms.filter((term) => term.trim().length > 1);
  if (usable.length === 0) return [{ text, marked: false }];
  const pattern = new RegExp(
    `(${usable.map((term) => term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('|')})`,
    'giu',
  );
  return text.split(pattern).map((part, index) => ({ text: part, marked: index % 2 === 1 }));
}

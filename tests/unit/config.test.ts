import { describe, expect, it } from 'vitest';
import { safeRedirect } from '../../src/domain/redirects';

describe('safe redirects', () => {
  it('accepts same-origin paths and blocks external origins', () => {
    expect(safeRedirect('/app/billing', 'https://citescout.example')).toBe(
      'https://citescout.example/app/billing',
    );
    expect(safeRedirect('https://evil.example/steal', 'https://citescout.example')).toBe(
      'https://citescout.example/app/overview',
    );
  });
});

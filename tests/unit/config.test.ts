import { describe, expect, it } from 'vitest';
import { safeRedirect } from '../../src/domain/redirects';

describe('safe redirects', () => {
  it('accepts same-origin paths and blocks external origins', () => {
    expect(safeRedirect('/app/billing', 'https://promptwatch.example')).toBe(
      'https://promptwatch.example/app/billing',
    );
    expect(safeRedirect('https://evil.example/steal', 'https://promptwatch.example')).toBe(
      'https://promptwatch.example/app/overview',
    );
  });
});

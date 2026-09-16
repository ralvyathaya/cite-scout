import { describe, expect, it } from 'vitest';
import { brand } from '../../src/shared/brand';

describe('brand configuration', () => {
  it('centralizes the product identity and price', () => {
    expect(brand.name).toBe('PromptWatch');
    expect(brand.priceMonthly).toBe(19);
  });
});

import { describe, expect, it } from 'vitest';
import { brand } from '../../src/shared/brand';

describe('brand configuration', () => {
  it('centralizes the product identity', () => {
    expect(brand.name).toBe('CiteScout');
  });
});

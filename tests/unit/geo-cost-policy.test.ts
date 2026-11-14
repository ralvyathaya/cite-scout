import { describe, expect, it } from 'vitest';
import { readProductionCostPolicy } from '../../src/shared/geo-cost-policy';
const policy = {
  version: 'synthetic-v1',
  globalMonthlyUsd: 10,
  projectMonthlyUsd: 1,
  globalMonthlyRequests: 100,
  projectMonthlyRequests: 10,
  requestCeilingsUsd: { perplexity_api: 0.01, serpapi: 0.001 },
};
describe('production cost policy validation', () => {
  it.each([
    '',
    '{}',
    '{invalid',
    JSON.stringify({ ...policy, globalMonthlyUsd: 0 }),
    JSON.stringify({ ...policy, projectMonthlyUsd: -1 }),
    JSON.stringify({ ...policy, globalMonthlyRequests: 1.5 }),
    JSON.stringify({ ...policy, requestCeilingsUsd: { perplexity_api: 0 } }),
    JSON.stringify({ ...policy, requestCeilingsUsd: { unknown: 1 } }),
    JSON.stringify({ ...policy, serpapiEstimatedCostUsd: 0.002 }),
    JSON.stringify({ ...policy, serpapiEstimatedCostUsd: 0 }),
    JSON.stringify({ ...policy, requestCeilingsUsd: {} }),
    JSON.stringify({ ...policy, extra: true }),
  ])('fails closed for %s', (value) => {
    expect(readProductionCostPolicy(value)).toBeNull();
  });
  it('accepts explicit versioned limits without assuming a search tariff', () => {
    expect(readProductionCostPolicy(JSON.stringify(policy))).toEqual(policy);
    expect(
      readProductionCostPolicy(JSON.stringify({ ...policy, serpapiEstimatedCostUsd: 0.001 })),
    ).toEqual({ ...policy, serpapiEstimatedCostUsd: 0.001 });
  });
});

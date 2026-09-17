import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('health endpoint', () => {
  it('returns the safe service status', async () => {
    const response = await exports.default.fetch(new Request('https://example.com/api/health'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { status: 'ok', service: 'citescout' },
    });
  });
});

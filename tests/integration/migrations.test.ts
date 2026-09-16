import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('database migrations', () => {
  it('creates core tables and enforces one project per user', async () => {
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users','projects','scan_results','provider_call_reservations') ORDER BY name",
    ).all<{ name: string }>();
    expect(tables.results.map((row) => row.name)).toEqual([
      'projects',
      'provider_call_reservations',
      'scan_results',
      'users',
    ]);
    const now = Date.now();
    await env.DB.prepare(
      'INSERT INTO users (id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,?,?,?)',
    )
      .bind('u1', 'User', 'u@example.com', 0, now, now)
      .run();
    await env.DB.prepare(
      'INSERT INTO projects (id,user_id,name,brand_name,canonical_domain,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
    )
      .bind('p1', 'u1', 'One', 'Brand', 'brand.test', now, now)
      .run();
    await expect(
      env.DB.prepare(
        'INSERT INTO projects (id,user_id,name,brand_name,canonical_domain,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
      )
        .bind('p2', 'u1', 'Two', 'Brand', 'brand.test', now, now)
        .run(),
    ).rejects.toThrow();
  });
});

import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const NOW = Date.now();

async function seedUser(id: string, email: string): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO users (id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,?,?,?)',
  )
    .bind(id, id, email, 0, NOW, NOW)
    .run();
}

async function seedProject(id: string, userId: string, brand = 'OrbitCal'): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO projects (id,user_id,name,brand_name,canonical_domain,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
  )
    .bind(id, userId, id, brand, 'orbitcal.test', NOW, NOW)
    .run();
}

async function seedPrompt(
  id: string,
  projectId: string,
  text: string,
  index: number,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO prompts (id,project_id,text,normalized_text,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
  )
    .bind(id, projectId, text, `prompt ${String(index)}`, 1, NOW + index, NOW + index)
    .run();
}

describe('database constraints and ownership', () => {
  it('enforces one project per user', async () => {
    await seedUser('u-limit', 'limit@example.com');
    await seedProject('p-limit-1', 'u-limit');

    await expect(
      env.DB.prepare(
        'INSERT INTO projects (id,user_id,name,brand_name,canonical_domain,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
      )
        .bind('p-limit-2', 'u-limit', 'Two', 'Brand', 'brand.test', NOW, NOW)
        .run(),
    ).rejects.toThrow();
  });

  it('enforces uniqueness of a normalized prompt per project', async () => {
    await seedUser('u-dup', 'dup@example.com');
    await seedProject('p-dup', 'u-dup');
    await seedPrompt('pr-dup-1', 'p-dup', 'Best tool for consultants', 1);

    // The unique index is on (project_id, normalized_text), so the same
    // normalized value must be rejected even under a different display text.
    await expect(
      env.DB.prepare(
        'INSERT INTO prompts (id,project_id,text,normalized_text,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
      )
        .bind('pr-dup-2', 'p-dup', 'BEST TOOL FOR CONSULTANTS', 'prompt 1', 1, NOW, NOW)
        .run(),
    ).rejects.toThrow();
  });

  it('cascades deletes from user to projects, prompts and results', async () => {
    await seedUser('u-cascade', 'cascade@example.com');
    await seedProject('p-cascade', 'u-cascade');
    await seedPrompt('pr-cascade', 'p-cascade', 'A buyer question about tools', 3);
    await env.DB.prepare(
      'INSERT INTO scan_runs (id,project_id,trigger_type,provider,status,observation_date,created_at) VALUES (?,?,?,?,?,?,?)',
    )
      .bind('sr-cascade', 'p-cascade', 'trial', 'perplexity', 'completed', '2026-09-16', NOW)
      .run();
    await env.DB.prepare(
      'INSERT INTO scan_results (id,scan_run_id,project_id,prompt_id,provider,provider_model,observation_date,brand_mentioned,competitor_mentions_json,matched_terms_json,context_classification,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    )
      .bind(
        'res-cascade',
        'sr-cascade',
        'p-cascade',
        'pr-cascade',
        'perplexity',
        'test/model',
        '2026-09-16',
        1,
        '[]',
        '[]',
        'mentioned',
        NOW,
      )
      .run();

    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind('u-cascade').run();

    const remaining = await env.DB.prepare(
      'SELECT (SELECT count(*) FROM projects WHERE user_id = ?) AS projects, (SELECT count(*) FROM prompts WHERE id = ?) AS prompts, (SELECT count(*) FROM scan_results WHERE id = ?) AS results',
    )
      .bind('u-cascade', 'pr-cascade', 'res-cascade')
      .first<{ projects: number; prompts: number; results: number }>();

    expect(remaining).toEqual({ projects: 0, prompts: 0, results: 0 });
  });

  it('prevents a second observation for the same prompt, provider and UTC day', async () => {
    await seedUser('u-daily', 'daily@example.com');
    await seedProject('p-daily', 'u-daily');
    await seedPrompt('pr-daily', 'p-daily', 'Another buyer question about tools', 4);
    await env.DB.prepare(
      'INSERT INTO scan_runs (id,project_id,trigger_type,provider,status,observation_date,created_at) VALUES (?,?,?,?,?,?,?)',
    )
      .bind('sr-daily', 'p-daily', 'manual', 'perplexity', 'completed', '2026-09-16', NOW)
      .run();

    const insert = (id: string): D1PreparedStatement =>
      env.DB.prepare(
        'INSERT INTO scan_results (id,scan_run_id,project_id,prompt_id,provider,provider_model,observation_date,brand_mentioned,competitor_mentions_json,matched_terms_json,context_classification,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      ).bind(
        id,
        'sr-daily',
        'p-daily',
        'pr-daily',
        'perplexity',
        'test/model',
        '2026-09-16',
        1,
        '[]',
        '[]',
        'mentioned',
        NOW,
      );

    await insert('res-daily-1').run();
    await expect(insert('res-daily-2').run()).rejects.toThrow();
  });

  it('rejects a reservation whose project does not exist (foreign key)', async () => {
    await seedUser('u-fk', 'fk@example.com');
    await seedProject('p-fk', 'u-fk');
    await seedPrompt('pr-fk', 'p-fk', 'Foreign key probe question about tools', 5);

    await expect(
      env.DB.prepare(
        'INSERT INTO provider_call_reservations (id,idempotency_key,user_id,project_id,prompt_id,scan_run_id,provider,usage_date,status,reserved_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      )
        .bind(
          'resv-fk',
          'key-fk',
          'u-fk',
          'p-fk',
          'pr-fk',
          'missing-run',
          'perplexity',
          '2026-09-16',
          'reserved',
          NOW,
        )
        .run(),
    ).rejects.toThrow();
  });

  it('does not allow two reservations with the same idempotency key', async () => {
    await seedUser('u-idem', 'idem@example.com');
    await seedProject('p-idem', 'u-idem');
    await seedPrompt('pr-idem', 'p-idem', 'Idempotency probe question about tools', 6);
    await env.DB.prepare(
      'INSERT INTO scan_runs (id,project_id,trigger_type,provider,status,observation_date,created_at) VALUES (?,?,?,?,?,?,?)',
    )
      .bind('sr-idem', 'p-idem', 'scheduled', 'perplexity', 'running', '2026-09-16', NOW)
      .run();

    const reserve = (id: string): D1PreparedStatement =>
      env.DB.prepare(
        'INSERT INTO provider_call_reservations (id,idempotency_key,user_id,project_id,prompt_id,scan_run_id,provider,usage_date,status,reserved_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      ).bind(
        id,
        'shared-key',
        'u-idem',
        'p-idem',
        'pr-idem',
        'sr-idem',
        'perplexity',
        '2026-09-16',
        'reserved',
        NOW,
      );

    await reserve('resv-idem-1').run();
    await expect(reserve('resv-idem-2').run()).rejects.toThrow();
  });

  it('stores a webhook fingerprint at most once', async () => {
    const insert = (): Promise<D1Result> =>
      env.DB.prepare(
        'INSERT INTO billing_webhook_receipts (fingerprint,provider,event_name,resource_type,received_at) VALUES (?,?,?,?,?)',
      )
        .bind('fingerprint-once', 'lemonsqueezy', 'subscription_created', 'subscriptions', NOW)
        .run();

    await insert();
    await expect(insert()).rejects.toThrow();
  });
});

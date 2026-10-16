import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { parseConfigFileTextToJson } from 'typescript';
import { z } from 'zod';

const configSchema = z.looseObject({
  name: z.string(),
  workers_dev: z.boolean(),
  preview_urls: z.boolean(),
  d1_databases: z.array(z.looseObject({ database_id: z.string() })),
  routes: z.array(z.looseObject({ pattern: z.string() })),
  vars: z.record(z.string(), z.string()),
});
const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function staging() {
  const input: unknown = parseConfigFileTextToJson(
    'wrangler.staging.jsonc',
    readFileSync('wrangler.staging.jsonc', 'utf8'),
  ).config;
  return configSchema.parse(input);
}

function check(config = staging(), flags = ['--allow-unprovisioned']) {
  const folder = mkdtempSync(join(tmpdir(), 'citescout-staging-test-'));
  folders.push(folder);
  const path = join(folder, 'staging.jsonc');
  writeFileSync(path, JSON.stringify(config));
  return spawnSync(process.execPath, ['scripts/check-staging.mjs', '--config', path, ...flags], {
    encoding: 'utf8',
    env: { ...process.env, STAGING_ACCESS_READ_TOKEN: '', STAGING_ACCESS_OWNER_EMAIL: '' },
  });
}

function checkAccess(application: object, policies: object[]) {
  const program = `import { validateAccess } from './scripts/check-staging.mjs';
try { validateAccess(${JSON.stringify(application)}, ${JSON.stringify(policies)}, 'owner@example.com'); }
catch (error) { console.error(error.message); process.exitCode = 1; }`;
  return spawnSync(process.execPath, ['--input-type=module', '-e', program], { encoding: 'utf8' });
}

describe('staging deployment guard', () => {
  it('keeps the Worker, database, and hostname isolated with paid flows disabled', () => {
    const config = staging();
    expect(config.name).toBe('citescout-staging');
    expect(config.routes.map((route) => route.pattern)).toEqual(['staging.cite-scout.com']);
    expect(config.vars).toMatchObject({
      APP_URL: 'https://staging.cite-scout.com',
      APP_ENV: 'production',
      DEPLOYMENT_ENV: 'staging',
      TEST_AUTH_ENABLED: 'false',
      GEO_SCANS_ENABLED: 'false',
      GEO_ANALYSIS_ENABLED: 'false',
      GEO_INTERNAL_TEST_SPEND_CAP_USD: '0',
    });
    expect(check(config).status).toBe(0);
  });

  it('rejects the production database even in static CI checks', () => {
    const config = staging();
    const database = config.d1_databases[0];
    if (!database) throw new Error('Missing staging database');
    database.database_id = '6e530e47-7c40-48fb-97b9-3e625ce6389b';
    const result = check(config);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('STAGING_DATABASE_MUST_BE_ISOLATED');
  });

  it('requires query redaction so provider credentials cannot enter fetch telemetry', () => {
    expect(check({ ...staging(), observability: { enabled: true } }).stderr).toContain(
      'STAGING_QUERY_REDACTION_REQUIRED',
    );
  });

  it.each(['workers_dev', 'preview_urls'] as const)('rejects the bypass surface %s', (field) => {
    const config = staging();
    config[field] = true;
    const result = check(config);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('STAGING_BYPASS_URLS_MUST_BE_DISABLED');
  });

  it('rejects a production hostname and authentication bypass', () => {
    const config = staging();
    config.routes = [{ pattern: 'cite-scout.com', custom_domain: true }];
    expect(check(config).stderr).toContain('STAGING_HOSTNAME_MUST_BE_ISOLATED');
    config.routes = [{ pattern: 'staging.cite-scout.com', custom_domain: true }];
    config.vars.TEST_AUTH_ENABLED = 'true';
    expect(check(config).stderr).toContain('STAGING_REAL_AUTH_REQUIRED');
  });

  it('blocks deployment without a provisioned database and verified Access policy', () => {
    const config = staging();
    const database = config.d1_databases[0];
    if (!database) throw new Error('Missing staging database');
    database.database_id = '00000000-0000-0000-0000-000000000000';
    const result = check(config, []);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('STAGING_DATABASE_NOT_PROVISIONED');
    database.database_id = 'a18cb677-05b7-4b91-b66b-dd0d5a1a0061';
    config.vars.TURNSTILE_SITE_KEY = 'staging-public-site-key';
    expect(check(config, []).stderr).toContain('STAGING_ACCESS_VERIFICATION_REQUIRED');
  });

  it('requires a complete bounded allowance before exceeding the original spending ceiling', () => {
    const config = staging();
    delete config.vars.GEO_INTERNAL_TEST_LIMITS;
    config.vars.GEO_INTERNAL_TEST_SPEND_CAP_USD = '5.01';
    expect(check(config).stderr).toContain('STAGING_TEST_BUDGET_INVALID');
    config.vars.GEO_INTERNAL_TEST_LIMITS = JSON.stringify({
      observations: 69,
      openai: 18,
      perplexity: 15,
      serpapi: 50,
      classifier: 85,
    });
    config.vars.GEO_INTERNAL_TEST_SPEND_CAP_USD = '9.54';
    expect(check(config).status).toBe(0);
    config.vars.GEO_INTERNAL_TEST_LIMITS = '{}';
    expect(check(config).stderr).toContain('STAGING_TEST_LIMITS_INVALID');
    config.vars.GEO_INTERNAL_TEST_LIMITS = JSON.stringify({
      observations: 70,
      openai: 18,
      perplexity: 15,
      serpapi: 50,
      classifier: 85,
    });
    expect(check(config).stderr).toContain('STAGING_TEST_LIMITS_INVALID');
  });

  it('rejects plaintext credentials and removal of required authentication secrets', () => {
    const config = staging();
    config.vars.OPENAI_API_KEY = 'test-only-value';
    const result = check(config);
    expect(result.stderr).toContain('STAGING_CREDENTIALS_MUST_USE_SECRETS');
    expect(result.stderr).not.toContain('test-only-value');
    delete config.vars.OPENAI_API_KEY;
    expect(check({ ...config, secrets: { required: [] } }).stderr).toContain(
      'STAGING_AUTH_SECRETS_REQUIRED',
    );
  });

  it('accepts exactly one owner email Allow policy for the entire staging hostname', () => {
    expect(
      checkAccess({ type: 'self_hosted', domain: 'staging.cite-scout.com' }, [
        { decision: 'allow', include: [{ email: { email: 'owner@example.com' } }] },
      ]).status,
    ).toBe(0);
  });

  it.each([
    [{ decision: 'bypass', include: [{ everyone: {} }] }],
    [{ decision: 'allow', include: [{ everyone: {} }] }],
    [{ decision: 'allow', include: [{ email: { email: 'other@example.com' } }] }],
    [
      { decision: 'allow', include: [{ email: { email: 'owner@example.com' } }] },
      { decision: 'bypass', include: [{ everyone: {} }] },
    ],
  ])('rejects Access rules that grant access beyond the owner', (...policies) => {
    const result = checkAccess({ type: 'self_hosted', domain: 'staging.cite-scout.com' }, policies);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('STAGING_ACCESS_OWNER_ONLY_POLICY_REQUIRED');
  });

  it('rejects an Access application that protects only a path', () => {
    const result = checkAccess({ type: 'self_hosted', domain: 'staging.cite-scout.com/app' }, [
      { decision: 'allow', include: [{ email: { email: 'owner@example.com' } }] },
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('STAGING_ACCESS_MUST_PROTECT_ENTIRE_HOSTNAME');
  });
});

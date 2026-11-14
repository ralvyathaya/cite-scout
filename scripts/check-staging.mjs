import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseConfigFileTextToJson } from 'typescript';
import testLimits from '../src/shared/geo-test-limits.json' with { type: 'json' };

const root = fileURLToPath(new URL('../', import.meta.url));
const hostname = 'staging.cite-scout.com';
const webhookDomain = `${hostname}/api/webhooks/lemonsqueezy`;
const webhookChildrenDomain = `${webhookDomain}/*`;
const unprovisionedDatabase = '00000000-0000-0000-0000-000000000000';

function readConfig(path) {
  const parsed = parseConfigFileTextToJson(path, readFileSync(path, 'utf8'));
  if (parsed.error || !parsed.config || typeof parsed.config !== 'object') {
    throw new Error('STAGING_CONFIG_INVALID');
  }
  return parsed.config;
}

export function validateStaging(staging, production, allowUnprovisioned = false) {
  if (staging.name !== 'citescout-staging' || staging.name === production.name) {
    throw new Error('STAGING_WORKER_MUST_BE_ISOLATED');
  }
  const database = staging.d1_databases?.[0];
  if (
    staging.d1_databases?.length !== 1 ||
    database?.binding !== 'DB' ||
    database.database_name !== 'citescout-staging' ||
    database.preview_database_id ||
    production.d1_databases?.some(
      (item) =>
        item.database_id === database.database_id || item.database_name === database.database_name,
    )
  ) {
    throw new Error('STAGING_DATABASE_MUST_BE_ISOLATED');
  }
  if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(database.database_id)) {
    throw new Error('STAGING_DATABASE_NOT_PROVISIONED');
  }
  if (!allowUnprovisioned && database.database_id === unprovisionedDatabase) {
    throw new Error('STAGING_DATABASE_NOT_PROVISIONED');
  }
  if (staging.workers_dev !== false || staging.preview_urls !== false) {
    throw new Error('STAGING_BYPASS_URLS_MUST_BE_DISABLED');
  }
  if (staging.observability?.redact_query_string !== true) {
    throw new Error('STAGING_QUERY_REDACTION_REQUIRED');
  }
  if (
    staging.route ||
    staging.env ||
    staging.routes?.length !== 1 ||
    staging.routes[0].pattern !== hostname ||
    staging.routes[0].custom_domain !== true ||
    staging.routes[0].previews_enabled === true ||
    staging.vars?.APP_URL !== `https://${hostname}` ||
    staging.vars.APP_URL === production.vars?.APP_URL
  ) {
    throw new Error('STAGING_HOSTNAME_MUST_BE_ISOLATED');
  }
  if (
    staging.vars.APP_ENV !== 'production' ||
    staging.vars.DEPLOYMENT_ENV !== 'staging' ||
    staging.vars.TEST_AUTH_ENABLED !== 'false'
  ) {
    throw new Error('STAGING_REAL_AUTH_REQUIRED');
  }
  if (staging.ai?.binding !== 'AI') throw new Error('STAGING_AI_BINDING_REQUIRED');
  if (staging.build?.command !== 'node scripts/check-staging.mjs') {
    throw new Error('STAGING_DEPLOYMENT_GUARD_REQUIRED');
  }
  if (
    !['BETTER_AUTH_SECRET', 'OPERATOR_SECRET', 'RESEND_API_KEY', 'TURNSTILE_SECRET_KEY'].every(
      (name) => staging.secrets?.required?.includes(name),
    )
  ) {
    throw new Error('STAGING_AUTH_SECRETS_REQUIRED');
  }
  for (const name of Object.keys(staging.vars)) {
    if (/API_KEY|SECRET|PASSWORD|LOGIN|INTERNAL_TEST_USER_ID|INTERNAL_TEST_EXPIRES_AT/.test(name)) {
      throw new Error('STAGING_CREDENTIALS_MUST_USE_SECRETS');
    }
  }
  const budget = Number(staging.vars.GEO_INTERNAL_TEST_SPEND_CAP_USD ?? '0');
  const override = (staging.vars.GEO_INTERNAL_TEST_LIMITS ?? '').trim();
  if (override) {
    try {
      const limits = JSON.parse(override);
      if (
        !limits ||
        Array.isArray(limits) ||
        Object.keys(limits).length !== Object.keys(testLimits.maximum).length ||
        Object.entries(testLimits.maximum).some(
          ([key, maximum]) =>
            !Number.isInteger(limits[key]) || limits[key] < 0 || limits[key] > maximum,
        )
      )
        throw new Error();
    } catch {
      throw new Error('STAGING_TEST_LIMITS_INVALID');
    }
  }
  if (
    !Number.isFinite(budget) ||
    budget < 0 ||
    budget > (override ? testLimits.maximumSpendUsd : testLimits.legacySpendUsd)
  ) {
    throw new Error('STAGING_TEST_BUDGET_INVALID');
  }
  if (
    !allowUnprovisioned &&
    (!staging.vars.TURNSTILE_SITE_KEY || staging.vars.TURNSTILE_SITE_KEY.startsWith('SET_'))
  ) {
    throw new Error('STAGING_TURNSTILE_NOT_CONFIGURED');
  }
}

export function validateAccess(application, policies, ownerEmail, domain = hostname) {
  if (
    application?.type !== 'self_hosted' ||
    application.domain !== domain ||
    application.options_preflight_bypass === true ||
    application.self_hosted_domains?.some((value) => value !== domain) ||
    application.destinations?.some(
      (destination) => destination.type !== 'public' || destination.uri !== domain,
    )
  ) {
    throw new Error('STAGING_ACCESS_MUST_PROTECT_ENTIRE_HOSTNAME');
  }
  const policy = policies?.[0];
  const include = policy?.include?.[0];
  if (
    !Array.isArray(policies) ||
    policies.length !== 1 ||
    policy.decision !== 'allow' ||
    policy.include?.length !== 1 ||
    !include?.email ||
    Object.keys(include).length !== 1 ||
    Object.keys(include.email).length !== 1 ||
    include.email.email?.toLowerCase() !== ownerEmail.toLowerCase()
  ) {
    throw new Error('STAGING_ACCESS_OWNER_ONLY_POLICY_REQUIRED');
  }
}

export function validateWebhookAccess(application, policies) {
  const policy = policies?.[0];
  const include = policy?.include?.[0];
  if (
    application?.type !== 'self_hosted' ||
    application.domain !== webhookDomain ||
    application.options_preflight_bypass === true ||
    application.self_hosted_domains?.some((domain) => domain !== webhookDomain) ||
    application.destinations?.some(
      (destination) => destination.type !== 'public' || destination.uri !== webhookDomain,
    ) ||
    !Array.isArray(policies) ||
    policies.length !== 1 ||
    policy.decision !== 'bypass' ||
    policy.include?.length !== 1 ||
    !include ||
    Object.keys(include).length !== 1 ||
    !include.everyone ||
    typeof include.everyone !== 'object' ||
    Array.isArray(include.everyone) ||
    Object.keys(include.everyone).length !== 0 ||
    (policy.exclude?.length ?? 0) !== 0 ||
    (policy.require?.length ?? 0) !== 0
  ) {
    throw new Error('STAGING_WEBHOOK_ACCESS_MUST_BE_EXACT_BYPASS');
  }
}

export async function verifyAccess(env, requireWebhook = false) {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const appId = env.STAGING_ACCESS_APPLICATION_ID;
  const token = env.STAGING_ACCESS_READ_TOKEN;
  const ownerEmail = env.STAGING_ACCESS_OWNER_EMAIL;
  if (
    !/^[a-f\d]{32}$/i.test(accountId ?? '') ||
    !/^[a-f\d-]{36}$/i.test(appId ?? '') ||
    !token ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail ?? '')
  ) {
    throw new Error('STAGING_ACCESS_VERIFICATION_REQUIRED');
  }
  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/access/apps`;
  async function request(path) {
    let response, text;
    try {
      response = await fetch(`${base}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`STAGING_ACCESS_API_HTTP_${response.status}`);
      text = await response.text();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('STAGING_')) throw error;
      throw new Error(
        error?.name === 'TimeoutError'
          ? 'STAGING_ACCESS_API_TIMEOUT'
          : 'STAGING_ACCESS_API_UNAVAILABLE',
        { cause: error },
      );
    }
    if (text.length > 1_000_000) throw new Error('STAGING_ACCESS_RESPONSE_TOO_LARGE');
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error('STAGING_ACCESS_RESPONSE_INVALID');
    }
    if (body?.success !== true || (body.result_info?.total_pages ?? 1) > 1) {
      throw new Error('STAGING_ACCESS_VERIFICATION_INCOMPLETE');
    }
    return body.result;
  }
  const [application, policies, applications] = await Promise.all([
    request(`/${appId}`),
    request(`/${appId}/policies?per_page=100`),
    request('?per_page=1000'),
  ]);
  validateAccess(application, policies, ownerEmail);
  if (!Array.isArray(applications)) {
    throw new Error('STAGING_ACCESS_VERIFICATION_INCOMPLETE');
  }
  const overlapping = applications.filter(
    (app) =>
      app.id !== appId &&
      [
        app.domain,
        ...(app.self_hosted_domains ?? []),
        ...(app.destinations ?? []).map((d) => d.uri),
      ]
        .filter((domain) => typeof domain === 'string')
        .some((domain) => domain === hostname || domain.startsWith(`${hostname}/`)),
  );
  const webhook = overlapping.find((app) => app.domain === webhookDomain);
  const children = overlapping.find((app) => app.domain === webhookChildrenDomain);
  if (overlapping.length !== Number(Boolean(webhook)) + Number(Boolean(children))) {
    throw new Error('STAGING_ACCESS_OVERLAPPING_APPLICATION_REQUIRES_REVIEW');
  }
  for (const app of overlapping) {
    if (!/^[a-f\d-]{36}$/i.test(app.id ?? ''))
      throw new Error('STAGING_ACCESS_VERIFICATION_INCOMPLETE');
    const policies = await request(`/${app.id}/policies?per_page=100`);
    if (app.domain === webhookDomain) validateWebhookAccess(app, policies);
    else validateAccess(app, policies, ownerEmail, webhookChildrenDomain);
  }
  // Access path policies can be inherited by child paths; keep those owner-only.
  if (webhook && !children) throw new Error('STAGING_WEBHOOK_CHILDREN_OWNER_REQUIRED');
  if (requireWebhook && !webhook) throw new Error('STAGING_WEBHOOK_ACCESS_REQUIRED');
}

async function main() {
  const args = process.argv.slice(2);
  let configPath = resolve(root, 'wrangler.staging.jsonc');
  let allowUnprovisioned = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--allow-unprovisioned') allowUnprovisioned = true;
    else if (args[index] === '--config' && args[index + 1]) configPath = resolve(args[++index]);
    else
      throw new Error(
        'Usage: node scripts/check-staging.mjs [--config PATH] [--allow-unprovisioned]',
      );
  }
  const staging = readConfig(configPath);
  validateStaging(
    staging,
    readConfig(resolve(root, 'wrangler.production.jsonc')),
    allowUnprovisioned,
  );
  if (allowUnprovisioned) {
    console.log(
      'Staging static isolation checks passed; remote resources and Access were not verified.',
    );
    return;
  }
  try {
    process.loadEnvFile(resolve(root, '.env.staging.access'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('STAGING_ACCESS_ENV_INVALID', { cause: error });
  }
  await verifyAccess(process.env, staging.vars.BILLING_PLANS_ENABLED === 'true');
  console.log('Staging isolation and owner-only Cloudflare Access checks passed.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    // Provider/API bodies and credential values must never reach operator output.
    console.error(
      error instanceof Error && error.message.startsWith('STAGING_')
        ? error.message
        : 'STAGING_PREFLIGHT_FAILED',
    );
    process.exitCode = 1;
  });
}

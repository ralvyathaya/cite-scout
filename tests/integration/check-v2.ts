/// <reference types="node" />
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { analyzeEvidence, compareEvidence } from '../../src/domain/evidence';
import { processDueScans, startScan, readRun, cancelTrial } from '../../src/server/v2/scans';
import { observationPayload, projectPayload, questionRows } from '../../src/server/v2/read-model';
import { deleteAccountData } from '../../src/server/account-deletion';
import { recordPayment } from '../../src/server/v2/payments';
import { clientEvent } from '../../src/server/v2/routes';
import { highlight } from '../../src/client/lib/highlight';

// In-memory SQLite and synthetic provider responses only; never reads credentials or calls a service.
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for (const name of [
  '0000_careless_selene',
  '0001_sticky_the_hand',
  '0002_citescout_v2',
  '0003_geo_action_loop',
  '0004_geo_analysis',
  '0005_geo_actions',
  '0006_geo_measurement',
  '0007_geo_processing_usage',
  '0008_geo_playbook_recovery',
  '0009_geo_daily_outcomes',
  '0010_tough_gamma_corps',
]) {
  if (name === '0002_citescout_v2')
    db.exec(`
    INSERT INTO users(id,name,email,created_at,updated_at) VALUES('legacy','Legacy','legacy@example.test',1,1);
    INSERT INTO projects(id,user_id,name,brand_name,canonical_domain,created_at,updated_at) VALUES('legacy','legacy','Legacy','Legacy','legacy.example',1,1);
    INSERT INTO prompts(id,project_id,text,normalized_text,created_at,updated_at) VALUES('legacy','legacy','Legacy question','legacy question',1,1);
    INSERT INTO scan_runs(id,project_id,trigger_type,provider,status,observation_date,created_at) VALUES('legacy','legacy','trial','perplexity','completed','2026-01-01',1);
    INSERT INTO scan_results(id,scan_run_id,project_id,prompt_id,provider,provider_model,observation_date,raw_response_text,citation_data_json,brand_mentioned,context_classification,created_at)
    VALUES('legacy','legacy','legacy','legacy','perplexity','old','2026-01-01','Retained legacy answer','[{"url":"https://legacy.example/docs"}]',1,'mentioned',1);
  `);
  if (name === '0007_geo_processing_usage')
    db.exec(`INSERT INTO geo_processing_attempts(id,request_id,kind,provider,input_hash,input_json,state,estimated_cost_usd,created_at,due_at)
      VALUES('retained-processing','retained-request','analysis','workers_ai','retained-hash','{}','failed','0.01',1767225600000,1767225600000)`);
  db.exec(readFileSync(`migrations/${name}.sql`, 'utf8'));
}
assert.deepEqual(
  {
    ...db
      .prepare(
        "SELECT usage_date,created_at,estimated_cost_usd FROM geo_processing_attempts WHERE id='retained-processing'",
      )
      .get(),
  },
  {
    usage_date: '2026-01-01',
    created_at: 1767225600000,
    estimated_cost_usd: '0.01',
  },
);
assert.equal(
  db.prepare("SELECT raw_response_text FROM scan_results WHERE id='legacy'").get()
    ?.raw_response_text,
  'Retained legacy answer',
);
assert.ok(db.prepare("SELECT v2_enabled_at FROM projects WHERE id='legacy'").get()?.v2_enabled_at);
class Statement {
  constructor(
    readonly query: string,
    readonly params: SQLInputValue[] = [],
  ) {}
  bind(...values: SQLInputValue[]) {
    return new Statement(this.query, values);
  }
  execute() {
    const statement = db.prepare(this.query);
    const results = statement.all(...this.params);
    const changes = db.prepare('SELECT changes() AS n').get()?.n;
    return { success: true, results, meta: { changes: Number(changes) } };
  }
  all() {
    return Promise.resolve(this.execute());
  }
  run() {
    return this.all();
  }
  first() {
    return Promise.resolve(this.execute().results[0] ?? null);
  }
  raw() {
    return Promise.resolve(this.execute().results.map(Object.values));
  }
}
const adapter = {
  prepare: (query: string) => new Statement(query),
  batch: (statements: Statement[]) => {
    db.exec('BEGIN');
    try {
      const result = statements.map((s) => s.execute());
      db.exec('COMMIT');
      return Promise.resolve(result);
    } catch (error) {
      db.exec('ROLLBACK');
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  },
};
const env = {
  DB: adapter,
  EXTERNAL_INTEGRATIONS_ENABLED: 'true',
  V2_SCANS_ENABLED: 'true',
  PERPLEXITY_API_KEY: 'synthetic',
  GLOBAL_DAILY_PROVIDER_CALL_CAP: '150',
  PER_USER_MONTHLY_PROVIDER_CALL_CAP: '350',
} as unknown as CloudflareBindings;
const now = new Date('2026-10-08T12:00:00Z');
// The first request after sign-in must work for both upgraded and new accounts.
const legacyWorkspace = await projectPayload(env, 'legacy');
assert.equal(legacyWorkspace.project?.id, 'legacy');
assert.equal(legacyWorkspace.project.questions[0]?.id, 'legacy');
assert.equal(legacyWorkspace.enrolled, false);
const newWorkspace = await projectPayload(env, 'new-account');
assert.equal(newWorkspace.project, null);
assert.equal(newWorkspace.trial, null);
assert.equal(newWorkspace.usage.today, 0);
assert.equal(
  clientEvent.safeParse({
    name: 'answer_inspected',
    observationId: crypto.randomUUID(),
    sourceKey: 'private@example.com',
  }).success,
  false,
);
assert.equal(
  highlight('  Cedar [1]\n<script>literal</script>', ['Cedar'])
    .map((part) => part.text)
    .join(''),
  '  Cedar [1]\n<script>literal</script>',
);
function seed(user: string) {
  db.prepare('INSERT INTO users(id,name,email,created_at,updated_at) VALUES(?,?,?,?,?)').run(
    user,
    user,
    `${user}@example.test`,
    now.getTime(),
    now.getTime(),
  );
  db.prepare(
    'INSERT INTO projects(id,user_id,name,brand_name,canonical_domain,v2_enabled_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
  ).run(user, user, 'Cedar', 'Cedar', 'cedar.example', now.getTime(), now.getTime(), now.getTime());
  db.prepare(
    'INSERT INTO competitors(id,project_id,name,normalized_name,created_at,updated_at) VALUES(?,?,?,?,?,?)',
  ).run(`${user}-rival`, user, 'Rival', 'rival', now.getTime(), now.getTime());
  for (let i = 0; i < 3; i++)
    db.prepare(
      'INSERT INTO prompts(id,project_id,text,normalized_text,created_at,updated_at) VALUES(?,?,?,?,?,?)',
    ).run(
      `${user}-${String(i)}`,
      user,
      `Buyer question ${String(i)}`,
      `buyer question ${String(i)}`,
      now.getTime(),
      now.getTime(),
    );
  db.prepare(
    "INSERT INTO pilot_enrollments(user_id,qualified_at,manual_check_at,role,authority_confirmed,example_verified) VALUES(?,?,?,'founder',1,1)",
  ).run(user, now.getTime(), now.getTime());
}
let calls = 0;
let fail = false;
const response = () => ({
  id: crypto.randomUUID(),
  status: 'completed',
  model: 'synthetic-model',
  output: [
    {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'Cedar is an option. [1]' }],
    },
    {
      type: 'search_results',
      results: [{ id: 1, url: 'https://cedar.example/docs', title: 'Documentation' }],
    },
  ],
});
const originalFetch = globalThis.fetch;
globalThis.fetch = () => {
  calls++;
  return Promise.resolve(fail ? new Response('{}', { status: 503 }) : Response.json(response()));
};
try {
  const legacy = await observationPayload(env, 'legacy', 'legacy');
  assert.equal(legacy?.observation.legacySources.length, 1);
  assert.equal(legacy.previousId, null);
  seed('pilot');
  const run = await startScan(env, 'pilot', 'baseline', now);
  assert.equal(await startScan(env, 'pilot', 'baseline', now), run);
  await Promise.all([processDueScans(env, 20, now), processDueScans(env, 20, now)]);
  assert.equal(calls, 3);
  assert.equal((await readRun(env, 'pilot', run))?.counts.successful, 3);
  const enrollment = db
    .prepare("SELECT followup_due_at FROM pilot_enrollments WHERE user_id='pilot'")
    .get();
  assert.ok(Number(enrollment?.followup_due_at) >= now.getTime() + 3 * 86400000);
  await processDueScans(env, 20, new Date(Number(enrollment?.followup_due_at) + 1000));
  assert.equal(calls, 6);
  assert.equal(
    db.prepare("SELECT trial_state FROM pilot_enrollments WHERE user_id='pilot'").get()
      ?.trial_state,
    'completed',
  );
  const rows = await questionRows(env, 'pilot');
  assert.equal(rows.summary.comparable, 3);
  const id = rows.questions[0]?.latest?.id;
  assert.ok(id);
  const evidence = await observationPayload(env, 'pilot', id);
  assert.ok(evidence?.comparison?.capture?.textParts.length);
  assert.equal(await observationPayload(env, 'someone-else', id), null);
  assert.equal(evidence.observation.capture?.links[0]?.status, 'verified');
  const context = evidence.observation.context;
  assert.ok(context);
  const capture = analyzeEvidence(response(), context);
  assert.equal(
    compareEvidence(
      { id: 'a', context, capture, evidenceVersion: 'v2' },
      { id: 'b', context, capture: { ...capture, model: 'different' }, evidenceVersion: 'v2' },
    ).eligible,
    false,
  );
  assert.throws(() => analyzeEvidence({ ...response(), status: 'incomplete' }, context));
  seed('failure');
  fail = true;
  const failed = await startScan(env, 'failure', 'baseline', now);
  await processDueScans(env, 20, now);
  assert.equal(calls, 9);
  await processDueScans(env, 20, now);
  assert.equal(calls, 9);
  await processDueScans(env, 20, new Date(now.getTime() + 86400000));
  assert.equal(calls, 12);
  assert.equal((await readRun(env, 'failure', failed))?.status, 'failed');
  seed('capped');
  await startScan(env, 'capped', 'baseline', now);
  await processDueScans({ ...env, GLOBAL_DAILY_PROVIDER_CALL_CAP: '1' }, 20, now);
  assert.equal(calls, 12);
  assert.equal(
    db
      .prepare(
        "SELECT sum(attempts_used) AS n FROM scan_run_items i JOIN scan_runs r ON r.id=i.run_id WHERE r.project_id='capped'",
      )
      .get()?.n,
    0,
  );
  db.exec(readFileSync('scripts/pilot-report.sql', 'utf8'));
  // A refund arriving before a paid webhook must stay excluded after the paid webhook retries.
  db.exec(
    "INSERT INTO subscriptions(id,user_id,lemon_squeezy_subscription_id,lemon_squeezy_customer_id,lemon_squeezy_store_id,lemon_squeezy_product_id,lemon_squeezy_variant_id,status,test_mode,created_at,updated_at) VALUES('s','pilot','s','c','1','1','1','active',0,1,1); INSERT INTO billing_webhook_receipts(fingerprint,event_name,resource_type,received_at,processed_at) VALUES('receipt','subscription_payment_refunded','subscription-invoices',1,1)",
  );
  const invoice = {
    status: 'paid',
    refunded: false,
    billing_reason: 'initial',
    total: 1900,
    subtotal: 1900,
    currency: 'USD',
    test_mode: false,
    created_at: now.toISOString(),
  };
  await recordPayment(
    env,
    's',
    'invoice',
    { ...invoice, status: 'refunded', refunded: true },
    'receipt',
  );
  await recordPayment(env, 's', 'invoice', invoice, 'receipt');
  assert.equal(
    db
      .prepare(
        "SELECT json_extract(properties_json,'$.refunded') AS n FROM product_events WHERE dedupe_key='invoice:invoice'",
      )
      .get()?.n,
    1,
  );
  assert.equal(await deleteAccountData(env, 'failure'), true);
  await cancelTrial(env, 'capped');
  fail = false;
  const upgrade = new Date(now.getTime() + 4 * 86400000);
  await processDueScans(env, 20, upgrade);
  assert.equal(calls, 12, 'Upgrade waits for the next UTC day');
  const paidDay = new Date(upgrade.getTime() + 86400000);
  await processDueScans(env, 20, paidDay);
  assert.equal(calls, 15);
  db.prepare(
    'INSERT INTO prompts(id,project_id,text,normalized_text,created_at,updated_at) VALUES(?,?,?,?,?,?)',
  ).run(
    'new-paid',
    'pilot',
    'A new buyer question',
    'a new buyer question',
    paidDay.getTime(),
    paidDay.getTime(),
  );
  await startScan(env, 'pilot', 'today', paidDay);
  await processDueScans(env, 20, paidDay);
  assert.equal(calls, 15, 'A daily intent cannot add a second check or refill questions');
  await processDueScans(env, 20, new Date(paidDay.getTime() + 86400000));
  assert.equal(calls, 19, 'New paid question starts on the following day');
  assert.equal(
    db
      .prepare(
        'SELECT count(*) AS n FROM provider_call_reservations WHERE user_id IS NULL AND (request_context_json IS NOT NULL OR provider_response_json IS NOT NULL)',
      )
      .get()?.n,
    0,
  );
  const sharedBudgetDay = new Date('2026-11-01T12:00:00Z');
  db.prepare(
    `INSERT INTO provider_call_reservations
    (id,idempotency_key,provider,usage_date,status,reserved_at,item_id,lease_until)
    VALUES('geo-ledger','geo-ledger','dataforseo','2026-11-01','reserved',?,'geo-item',?)`,
  ).run(sharedBudgetDay.getTime() - 600000, sharedBudgetDay.getTime() - 1);
  seed('cross-provider-cap');
  await startScan(env, 'cross-provider-cap', 'baseline', sharedBudgetDay);
  const beforeSharedBudget = calls;
  await processDueScans({ ...env, GLOBAL_DAILY_PROVIDER_CALL_CAP: '1' }, 20, sharedBudgetDay);
  assert.equal(calls, beforeSharedBudget, 'Global cap includes every collector provider');
  assert.equal(
    db.prepare("SELECT status FROM provider_call_reservations WHERE id='geo-ledger'").get()?.status,
    'reserved',
    'Legacy recovery cannot retire a GEO collector lease',
  );
  console.log(
    'V2 self-check passed: migration, trial/retry/caps, concurrent claims, paid scheduling, evidence, ownership, refund ordering, cohort SQL and deletion.',
  );
} finally {
  globalThis.fetch = originalFetch;
  db.close();
}

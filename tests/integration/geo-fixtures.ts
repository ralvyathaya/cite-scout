import { readCurrentGeoContexts, readGeoRun, saveGeoSettings } from '../../src/server/v2/geo-store';
import { env as testEnv } from 'cloudflare:workers';
import { seed, withBindings } from './fixtures';
import { buildGeoEvaluation, projectGeoClassification } from '../../src/domain/geo-classification';
import { diagnoseGeo } from '../../src/domain/geo-diagnosis';
import { validateDecision } from '../../src/integrations/decision/client';
import type { GeoEngine, GeoObservation } from '../../src/shared/geo';
import type { NativeDecision, GeoClassification } from '../../src/shared/geo-analysis';

export function geoBindings(overrides: Record<string, string> = {}) {
  return withBindings({
    BILLING_PLAN_VARIANTS: JSON.stringify({
      test: { pro: { month: '900001' } },
      live: { pro: { month: '900002' } },
    }),
    ...overrides,
  });
}
export async function seedGeoSubscriber(count = 3, paid = false, at = new Date()) {
  const owner = await seed(count, paid, at);
  if (paid)
    await testEnv.DB.prepare(
      "UPDATE subscriptions SET lemon_squeezy_variant_id='900001' WHERE user_id=?",
    )
      .bind(owner.userId)
      .run();
  return owner;
}

// Read-model fixtures include older same-day captures, independently of today's admission policy.
async function savedRun(
  env: CloudflareBindings,
  owner: { userId: string; projectId: string },
  engine: GeoEngine,
  at: Date,
) {
  const promptId = await env.DB.prepare(
    'SELECT id FROM prompts WHERE project_id=? AND enabled=1 AND archived_at IS NULL ORDER BY id LIMIT 1',
  )
    .bind(owner.projectId)
    .first<string>('id');
  if (!promptId) throw new Error('fixture prompt');
  const context = (await readCurrentGeoContexts(env, owner.userId, [{ promptId, engine }]))[0];
  if (!context) throw new Error('fixture context');
  const id = crypto.randomUUID(),
    itemId = crypto.randomUUID(),
    reservationId = crypto.randomUUID(),
    json = JSON.stringify(context),
    now = at.getTime();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO scan_runs(id,project_id,trigger_type,provider,status,observation_date,intent_key,context_version,due_at,created_at) VALUES(?,?,'manual','geo','completed',?,?,?,?,?)",
    ).bind(
      id,
      owner.projectId,
      at.toISOString().slice(0, 10),
      `fixture:${id}`,
      context.contextVersion,
      now,
      now,
    ),
    env.DB.prepare(
      'INSERT OR IGNORE INTO geo_prompt_versions(id,project_id,prompt_id,text,created_at) VALUES(?,?,?,?,?)',
    ).bind(context.promptVersionId, owner.projectId, promptId, context.promptText, now),
    env.DB.prepare(
      "INSERT INTO provider_call_reservations(id,idempotency_key,user_id,project_id,prompt_id,scan_run_id,provider,usage_date,status,reserved_at,item_id,request_context_json) VALUES(?,?,?,?,?,?,?,?,'succeeded',?,?,?)",
    ).bind(
      reservationId,
      `fixture:${itemId}`,
      owner.userId,
      owner.projectId,
      promptId,
      id,
      engine,
      at.toISOString().slice(0, 10),
      now,
      itemId,
      json,
    ),
    env.DB.prepare(
      "INSERT INTO geo_run_items(id,run_id,project_id,prompt_id,prompt_version_id,engine,status,context_json,reservation_id,due_at,created_at) VALUES(?,?,?,?,?,?,'succeeded',?,?,?,?)",
    ).bind(
      itemId,
      id,
      owner.projectId,
      promptId,
      context.promptVersionId,
      engine,
      json,
      reservationId,
      now,
      now,
    ),
    env.DB.prepare(
      'INSERT INTO geo_run_snapshots(run_id,project_id,request_id,payload_hash,snapshot_hash,context_json,settings_revision) VALUES(?,?,?,?,?,?,?)',
    ).bind(
      id,
      owner.projectId,
      crypto.randomUUID(),
      `fixture:${id}`,
      `fixture:${id}`,
      JSON.stringify([context]),
      context.settingsRevision,
    ),
  ]);
  return readGeoRun(env, owner.userId, id);
}

// Synthetic transport and inference data, confined to Vitest's isolated Worker/D1 database.
export async function seedGeoEvidence(
  env: CloudflareBindings,
  owner: { userId: string; projectId: string },
  engine: GeoEngine = 'perplexity',
  at = new Date(),
  text = 'Rival is recommended.',
  labels: {
    presence?: GeoClassification['brandPresence'];
    stance?: GeoClassification['brandStance'];
  } = {},
) {
  await env.DB.prepare(
    'INSERT OR IGNORE INTO competitors(id,project_id,name,normalized_name,canonical_domain,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
  )
    .bind(
      crypto.randomUUID(),
      owner.projectId,
      'Rival',
      'rival',
      'rival.example',
      at.getTime(),
      at.getTime(),
    )
    .run();
  await saveGeoSettings(
    env,
    owner.userId,
    {
      engines: [engine],
      dailyEnabled: false,
      languageCode: 'en',
      locationCode: 2840,
      device: 'desktop',
    },
    at,
  );
  const run = await savedRun(env, owner, engine, at),
    item = run.items[0];
  if (!item) throw new Error('fixture item');
  const id = crypto.randomUUID(),
    observation: GeoObservation = {
      id,
      projectId: owner.projectId,
      runId: run.id,
      itemId: item.id,
      promptVersionId: item.context.promptVersionId,
      engine,
      capturedAt: at.toISOString(),
      context: item.context,
      capture: {
        schemaVersion: 'geo-capture-1',
        answerText: text,
        raw: { fixture: true },
        model: engine === 'perplexity' ? 'fixture-model' : (item.context.requestedModel ?? null),
        modelReported: engine === 'perplexity' || Boolean(item.context.requestedModel),
        sources: [
          {
            id: 'source-1',
            url: 'https://reddit.com/r/tools/thread',
            canonicalUrl: 'https://reddit.com/r/tools/thread',
            title: 'Synthetic scheduling thread',
            referenceLevel: 'answer',
          },
        ],
        quality: 'complete',
        providerRequestId: 'fixture-task',
        providerStatus: 'fixture',
        reportedCost: 0,
        inputTokens: 0,
        outputTokens: 0,
        textParts: [{ itemIndex: 0, contentIndex: 0, text }],
      },
    };
  const evaluation = buildGeoEvaluation(observation);
  const native = validateDecision(
    {
      model: 'clef-flash',
      usage: { input_tokens: 0, output_tokens: 0 },
      answers: Object.fromEntries(
        Object.entries(evaluation.questions).map(
          ([name, question]): [string, NativeDecision['answers'][string]] => {
            if (question.type === 'noul') return [name, { type: 'noul', noul: 0.9 }];
            const selected =
              name === 'brand_presence'
                ? (labels.presence ?? 'absent')
                : name === 'brand_stance'
                  ? (labels.stance ?? 'not_applicable')
                  : name.startsWith('competitor_')
                    ? 'recommended'
                    : name.startsWith('fit_')
                      ? 'unclear'
                      : (Object.keys(question.criteria)[0] ?? 'unknown');
            return [
              name,
              {
                type: 'choice',
                choice: selected,
                confidence: 0.9,
                probabilities: Object.fromEntries(
                  Object.keys(question.criteria).map((option) => [
                    option,
                    option === selected ? 1 : 0,
                  ]),
                ),
              },
            ];
          },
        ),
      ),
    },
    evaluation,
    'clef-flash',
  );
  const classification = projectGeoClassification(observation, evaluation, native),
    diagnoses = diagnoseGeo(observation, classification),
    analysisId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO geo_observations(id,project_id,run_id,item_id,prompt_version_id,engine,model,status,context_json,capture_json,answer_text,captured_at) VALUES(?,?,?,?,?,?,?,'captured',?,?,?,?)",
    ).bind(
      id,
      owner.projectId,
      run.id,
      item.id,
      item.context.promptVersionId,
      engine,
      observation.capture.model,
      JSON.stringify(item.context),
      JSON.stringify(observation.capture),
      text,
      at.getTime(),
    ),
    env.DB.prepare(
      "INSERT INTO geo_processing_attempts(id,project_id,observation_id,request_id,kind,provider,model,rubric_version,policy_version,input_hash,input_json,state,result_json,input_tokens,output_tokens,estimated_cost_usd,latency_ms,created_at,due_at,completed_at) VALUES(?,?,?,?,'analysis','fixture','clef-flash',?,?,?,?,'completed',?,0,0,'0',0,?,?,?)",
    ).bind(
      analysisId,
      owner.projectId,
      id,
      crypto.randomUUID(),
      classification.rubricVersion,
      classification.policyVersion,
      `fixture-${id}`,
      JSON.stringify(evaluation),
      JSON.stringify({ classification, diagnoses }),
      at.getTime(),
      at.getTime(),
      at.getTime(),
    ),
    env.DB.prepare("UPDATE geo_run_items SET status='succeeded' WHERE id=?").bind(item.id),
    env.DB.prepare(
      "UPDATE provider_call_reservations SET status='succeeded',reported_cost='0' WHERE id=?",
    ).bind(item.reservationId),
  ]);
  return { observation, analysisId, run };
}

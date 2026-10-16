import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { createExecutionContext } from 'cloudflare:test';
import { seed, withBindings, cookie } from './fixtures';
import { seedGeoEvidence } from './geo-fixtures';
import {
  syncGeoActions,
  readGeoActions,
  readGeoAction,
  patchGeoAction,
  readGeoSources,
  createGeoFollowUp,
} from '../../src/server/v2/actions';
import { v2Routes } from '../../src/server/v2/routes';
import {
  completeGeoAction,
  reopenGeoAction,
  readGeoMeasurements,
} from '../../src/server/v2/measurement';
import { saveGeoSettings } from '../../src/server/v2/geo-store';
const bindings = () =>
  withBindings({
    GEO_SCANS_ENABLED: 'true',
    EXTERNAL_INTEGRATIONS_ENABLED: 'true',
    V2_SCANS_ENABLED: 'true',
    GEO_GLOBAL_DAILY_CALL_CAP: '150',
    GEO_PROJECT_DAILY_CALL_CAP: '40',
    GEO_PROJECT_MONTHLY_CALL_CAP: '100',
  });
describe('action ownership, lifecycle and deduplicated proof', () => {
  it('reads the current configuration once for a multi-engine follow-up scope', async () => {
    const env = bindings(),
      at = new Date(),
      owner = await seed(1, true, at),
      engines = ['perplexity', 'google_aio', 'bing_copilot'] as const,
      proofs = [];
    for (const engine of engines) {
      const proof = await seedGeoEvidence(env, owner, engine, at);
      proofs.push({ observationId: proof.observation.id, analysisId: proof.analysisId });
    }
    await saveGeoSettings(
      env,
      owner.userId,
      {
        engines: [...engines],
        dailyEnabled: false,
        languageCode: 'en',
        locationCode: 2840,
        device: 'desktop',
      },
      at,
    );
    await syncGeoActions(env, owner.userId, at);
    const source = (await readGeoActions(env, owner.userId)).find(
      (action) => action.category === 'owned',
    );
    if (!source) throw new Error('fixture action');
    const reads = vi.spyOn(env.DB, 'prepare');
    try {
      const followUp = await createGeoFollowUp(
        env,
        owner.userId,
        source.id,
        {
          requestId: crypto.randomUUID(),
          revision: source.revision,
          proofs,
          targetUrl: 'https://orbitcal.test/buyers',
          changeDescription: 'Clarify verified features.',
        },
        at,
      );
      expect(followUp.evidence).toHaveLength(3);
      expect(
        reads.mock.calls.filter(([query]) =>
          query.includes('canonical_domain AS domain FROM competitors'),
        ),
      ).toHaveLength(1);
    } finally {
      reads.mockRestore();
    }
  });
  it('creates an idempotent prospective Owned scope without changing its source pin or admitting later sync proof', async () => {
    const env = bindings(),
      at = new Date(),
      owner = await seed(1, true, at);
    await seedGeoEvidence(env, owner, 'google_aio', at);
    await seedGeoEvidence(env, owner, 'perplexity', at);
    await saveGeoSettings(
      env,
      owner.userId,
      {
        engines: ['google_aio', 'perplexity'],
        dailyEnabled: false,
        languageCode: 'en',
        locationCode: 2840,
        device: 'desktop',
      },
      at,
    );
    await syncGeoActions(env, owner.userId, at);
    const source = (await readGeoActions(env, owner.userId)).find(
      (action) => action.category === 'owned',
    );
    if (!source) throw new Error('fixture action');
    await completeGeoAction(
      env,
      owner.userId,
      source.id,
      {
        requestId: crypto.randomUUID(),
        revision: source.revision,
        implementedAt: at.toISOString(),
        changeDescription: 'Previous homepage inspection.',
      },
      at,
    );
    const fresh = await seedGeoEvidence(env, owner, 'perplexity', new Date(at.getTime() + 301_000));
    await saveGeoSettings(
      env,
      owner.userId,
      {
        engines: ['google_aio', 'perplexity'],
        dailyEnabled: false,
        languageCode: 'en',
        locationCode: 2840,
        device: 'desktop',
      },
      at,
    );
    await syncGeoActions(env, owner.userId, new Date(at.getTime() + 302_000));
    const before = await readGeoAction(env, owner.userId, source.id),
      input = {
        requestId: crypto.randomUUID(),
        revision: before.action.revision,
        proofs: [{ observationId: fresh.observation.id, analysisId: fresh.analysisId }],
        targetUrl: 'https://orbitcal.test/buyers',
        changeDescription: 'Clarify actual scheduling features on our buyer page.',
      };
    const [followUp, replay] = await Promise.all([
      createGeoFollowUp(env, owner.userId, source.id, input, new Date(at.getTime() + 303_000)),
      createGeoFollowUp(env, owner.userId, source.id, input, new Date(at.getTime() + 303_000)),
    ]);
    expect(replay).toEqual(followUp);
    expect(followUp.action.status).toBe('accepted');
    expect(followUp.action.id).not.toBe(source.id);
    expect(followUp.action.checkedIds).toEqual([]);
    expect(followUp.evidence.map((proof) => proof.observationId)).toEqual([fresh.observation.id]);
    expect(followUp.events).toHaveLength(1);
    expect(followUp.events[0]?.details).toMatchObject({
      sourceActionId: source.id,
      sourceRevision: before.action.revision,
      selectedProofs: input.proofs,
      targetUrl: input.targetUrl,
      changeDescription: input.changeDescription,
    });
    expect(followUp.events[0]?.details.excludedProofs).toHaveLength(2);
    expect(await readGeoAction(env, owner.userId, source.id)).toEqual(before);
    await seedGeoEvidence(env, owner, 'perplexity', new Date(at.getTime() + 602_000));
    await syncGeoActions(env, owner.userId, new Date(at.getTime() + 603_000));
    expect(await readGeoAction(env, owner.userId, followUp.action.id)).toEqual(followUp);
    const completed = await completeGeoAction(
      env,
      owner.userId,
      followUp.action.id,
      {
        requestId: crypto.randomUUID(),
        revision: followUp.action.revision,
        implementedAt: new Date(at.getTime() + 604_000).toISOString(),
        changeDescription: input.changeDescription,
        changeUrl: input.targetUrl,
      },
      new Date(at.getTime() + 605_000),
    );
    await seedGeoEvidence(env, owner, 'perplexity', new Date(at.getTime() + 86_400_000));
    const [comparison] = await readGeoMeasurements(
      env,
      owner.userId,
      completed.id,
      new Date(at.getTime() + 86_401_000),
    );
    expect(comparison?.cohorts).toHaveLength(1);
    expect(comparison?.metrics.find((metric) => metric.metric === 'mention')).toMatchObject({
      outcome: 'unchanged',
      scopeComplete: true,
      limitedData: true,
      afterSamples: 1,
    });
    await reopenGeoAction(
      env,
      owner.userId,
      completed.id,
      {
        requestId: crypto.randomUUID(),
        revision: completed.revision,
        reason: 'Correct the recorded work.',
      },
      new Date(at.getTime() + 606_000),
    );
    const reopened = await readGeoAction(env, owner.userId, completed.id);
    expect(reopened.action.scopes).toEqual(followUp.action.scopes);
    expect(reopened.events.map((event) => event.kind)).toEqual([
      'reopened',
      'completed',
      'accepted',
    ]);
    await expect(
      createGeoFollowUp(env, owner.userId, source.id, {
        ...input,
        targetUrl: 'https://orbitcal.test/other',
      }),
    ).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  });
  it('rejects stale, unowned, mismatched, incompatible and duplicate follow-up proof before any writes', async () => {
    const env = bindings(),
      at = new Date(),
      owner = await seed(1, true, at),
      other = await seed(1, true, at),
      proof = await seedGeoEvidence(env, owner, 'perplexity', at),
      foreign = await seedGeoEvidence(env, other, 'perplexity', at);
    await syncGeoActions(env, owner.userId, at);
    const source = (await readGeoActions(env, owner.userId)).find(
      (action) => action.category === 'owned',
    );
    if (!source) throw new Error('fixture action');
    const input = {
      requestId: crypto.randomUUID(),
      revision: source.revision,
      proofs: [{ observationId: proof.observation.id, analysisId: proof.analysisId }],
      targetUrl: 'https://orbitcal.test/buyers',
      changeDescription: 'Clarify the buyer page.',
    };
    const count = async () =>
      env.DB.prepare(
        "SELECT count(*) AS n FROM geo_actions WHERE json_extract(dedupe_key,'$[0]')='follow-up'",
      ).first<number>('n');
    const before = await count();
    await expect(createGeoFollowUp(env, other.userId, source.id, input)).rejects.toThrow(
      'GEO_ACTION_NOT_FOUND',
    );
    await expect(
      createGeoFollowUp(env, owner.userId, source.id, { ...input, revision: 99 }),
    ).rejects.toThrow('GEO_ACTION_CHANGED');
    await expect(
      createGeoFollowUp(env, owner.userId, source.id, {
        ...input,
        targetUrl: 'https://orbitcal.test.evil.example/path',
      }),
    ).rejects.toThrow('INVALID_FOLLOW_UP_TARGET');
    for (const proofs of [
      [{ observationId: proof.observation.id, analysisId: foreign.analysisId }],
      [{ observationId: foreign.observation.id, analysisId: foreign.analysisId }],
      [...input.proofs, ...input.proofs],
    ])
      await expect(
        createGeoFollowUp(env, owner.userId, source.id, { ...input, proofs }),
      ).rejects.toThrow('INVALID_FOLLOW_UP_PROOF');
    await expect(
      createGeoFollowUp(
        withBindings({ GEO_CLASSIFIER_MODEL: 'clef' }),
        owner.userId,
        source.id,
        input,
      ),
    ).rejects.toThrow('FOLLOW_UP_CONTEXT_CHANGED');
    await env.DB.prepare('UPDATE prompts SET text=? WHERE id=?')
      .bind('A different buyer question', owner.promptIds[0])
      .run();
    await expect(createGeoFollowUp(env, owner.userId, source.id, input)).rejects.toThrow(
      'FOLLOW_UP_CONTEXT_CHANGED',
    );
    await env.DB.prepare('UPDATE prompts SET text=? WHERE id=?')
      .bind(proof.observation.context.promptText, owner.promptIds[0])
      .run();
    const later = await seedGeoEvidence(env, owner, 'perplexity', new Date(at.getTime() + 301_000));
    await syncGeoActions(env, owner.userId, new Date(at.getTime() + 302_000));
    await expect(
      createGeoFollowUp(
        env,
        owner.userId,
        source.id,
        {
          ...input,
          proofs: [
            ...input.proofs,
            { observationId: later.observation.id, analysisId: later.analysisId },
          ],
        },
        new Date(at.getTime() + 303_000),
      ),
    ).rejects.toThrow('INVALID_FOLLOW_UP_PROOF');
    const app = new Hono<{ Bindings: CloudflareBindings }>().route('/api/v2', v2Routes);
    for (const [userId, status] of [
      [other.userId, 404],
      [owner.userId, 409],
    ] as const) {
      const response = await app.request(
        `/api/v2/geo/actions/${source.id}/follow-ups`,
        {
          method: 'POST',
          headers: { Cookie: await cookie(userId), 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...input, revision: 99 }),
        },
        env,
        createExecutionContext(),
      );
      expect(response.status).toBe(status);
    }
    await env.DB.prepare(
      "UPDATE geo_processing_attempts SET result_json=json_set(result_json,'$.classification.answerQuality','unknown') WHERE id=?",
    )
      .bind(proof.analysisId)
      .run();
    await expect(createGeoFollowUp(env, owner.userId, source.id, input)).rejects.toThrow(
      'INVALID_FOLLOW_UP_PROOF',
    );
    expect(await count()).toBe(before);
    expect((await readGeoAction(env, owner.userId, source.id)).events).toHaveLength(0);
  });
  it('atomically rejects a revision that changes between follow-up validation and persistence', async () => {
    const env = bindings(),
      at = new Date(),
      owner = await seed(1, true, at),
      proof = await seedGeoEvidence(env, owner, 'perplexity', at);
    await syncGeoActions(env, owner.userId, at);
    const source = (await readGeoActions(env, owner.userId)).find(
      (action) => action.category === 'owned',
    );
    if (!source) throw new Error('fixture action');
    const before = await readGeoActions(env, owner.userId),
      batch = env.DB.batch.bind(env.DB);
    const raced = vi.spyOn(env.DB, 'batch').mockImplementationOnce(async (statements) => {
      await env.DB.prepare('UPDATE geo_actions SET revision=revision+1 WHERE id=?')
        .bind(source.id)
        .run();
      return batch(statements);
    });
    try {
      await expect(
        createGeoFollowUp(
          env,
          owner.userId,
          source.id,
          {
            requestId: crypto.randomUUID(),
            revision: source.revision,
            proofs: [{ observationId: proof.observation.id, analysisId: proof.analysisId }],
            targetUrl: 'https://orbitcal.test/buyers',
            changeDescription: 'Edit the buyer page.',
          },
          at,
        ),
      ).rejects.toThrow('GEO_ACTION_CHANGED');
    } finally {
      raced.mockRestore();
    }
    expect(await readGeoActions(env, owner.userId)).toHaveLength(before.length);
    expect((await readGeoAction(env, owner.userId, source.id)).events).toHaveLength(0);
  });
  it('pages retained proof in SQL while preserving the total, latest scopes and completion history', async () => {
    const env = bindings(),
      at = new Date(),
      owner = await seed(1, true, at);
    const oldest = await seedGeoEvidence(env, owner, 'google_aio', at);
    await seedGeoEvidence(env, owner, 'perplexity', at);
    await syncGeoActions(env, owner.userId, at);
    const action = (await readGeoActions(env, owner.userId)).find(
      (candidate) => candidate.category === 'owned',
    );
    if (!action) throw new Error('fixture action');
    const original = await env.DB.prepare(
      "SELECT * FROM geo_action_evidence WHERE action_id=? AND json_extract(scope_json,'$.context.engine')='perplexity'",
    )
      .bind(action.id)
      .first<{ id: string; analysis_id: string; scope_json: string }>();
    if (!original) throw new Error('fixture proof');
    for (let index = 0; index < 60; index++) {
      const analysisId = crypto.randomUUID(),
        proofId = index.toString(16).padStart(64, '0'),
        createdAt = at.getTime() + index + 1;
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO geo_processing_attempts(id,project_id,observation_id,request_id,kind,provider,model,input_hash,input_json,state,result_json,created_at,due_at,completed_at,usage_date) SELECT ?,project_id,observation_id,?,'analysis',provider,model,? ,input_json,state,result_json,created_at,due_at,completed_at,usage_date FROM geo_processing_attempts WHERE id=?",
        ).bind(analysisId, crypto.randomUUID(), `fixture-proof-${proofId}`, original.analysis_id),
        env.DB.prepare(
          "INSERT INTO geo_action_evidence(id,action_id,observation_id,analysis_id,scope_json,evidence_ids_json,created_at) SELECT ?,action_id,observation_id,?,json_set(scope_json,'$.analysisId',?,'$.capturedAt',?),evidence_ids_json,? FROM geo_action_evidence WHERE id=?",
        ).bind(
          proofId,
          analysisId,
          analysisId,
          new Date(createdAt).toISOString(),
          createdAt,
          original.id,
        ),
      ]);
    }
    await completeGeoAction(
      env,
      owner.userId,
      action.id,
      {
        requestId: crypto.randomUUID(),
        revision: action.revision,
        implementedAt: at.toISOString(),
        changeDescription: 'Recorded the actual page inspection.',
      },
      new Date(at.getTime() + 1000),
    );
    const prepared = vi.spyOn(env.DB, 'prepare');
    try {
      const first = await readGeoAction(env, owner.userId, action.id);
      expect(first.evidence).toHaveLength(50);
      expect(first.action.evidenceCount).toBe(62);
      expect(first.action.scopes.map((scope) => scope.context.engine).sort()).toEqual([
        'google_aio',
        'perplexity',
      ]);
      expect(
        first.action.scopes.find((scope) => scope.context.engine === 'perplexity')?.capturedAt,
      ).toBe(new Date(at.getTime() + 60).toISOString());
      expect(first.evidence.every((proof) => proof.scope.context.engine === 'perplexity')).toBe(
        true,
      );
      if (!first.nextEvidenceCursor) throw new Error('Expected next proof page');
      const second = await readGeoAction(env, owner.userId, action.id, first.nextEvidenceCursor);
      expect(second.evidence).toHaveLength(12);
      expect(second.nextEvidenceCursor).toBeNull();
      expect(second.evidence.some((proof) => proof.observationId === oldest.observation.id)).toBe(
        true,
      );
      expect(
        new Set([...first.evidence, ...second.evidence].map((proof) => proof.analysisId)).size,
      ).toBe(62);
      expect(second.action).toEqual(first.action);
      expect(second.events).toEqual(first.events);
      expect(second.events.some((event) => event.kind === 'completed')).toBe(true);
      const listed = (await readGeoActions(env, owner.userId)).find(
        (candidate) => candidate.id === action.id,
      );
      expect(listed).toEqual(first.action);
      const evidenceQueries = prepared.mock.calls
        .map(([query]) => query)
        .filter((query) => query.includes('geo_action_evidence'));
      expect(
        evidenceQueries
          .filter((query) => query.includes('SELECT * FROM geo_action_evidence'))
          .every((query) => query.includes('LIMIT 51')),
      ).toBe(true);
      expect(
        evidenceQueries.some((query) => query.includes('SELECT e.* FROM geo_action_evidence')),
      ).toBe(false);
    } finally {
      prepared.mockRestore();
    }
  });
  it('merges engines and new evidence without resetting progress or resurrecting dismissal', async () => {
    const env = bindings(),
      at = new Date(),
      owner = await seed(1, true, at);
    await seedGeoEvidence(env, owner, 'perplexity', at);
    await syncGeoActions(env, owner.userId, at);
    const [action] = await readGeoActions(env, owner.userId);
    if (!action) throw new Error('fixture action');
    const requestId = crypto.randomUUID(),
      body = {
        requestId,
        revision: action.revision,
        status: 'in_progress' as const,
        checkedIds: ['step_1'],
        notes: 'Checking our actual buyer page.',
      };
    const progressed = await patchGeoAction(env, owner.userId, action.id, body, at);
    const replay = await patchGeoAction(env, owner.userId, action.id, body, at);
    expect(replay.revision).toBe(progressed.revision);
    await seedGeoEvidence(env, owner, 'google_aio', at);
    await syncGeoActions(env, owner.userId, at);
    const merged = await readGeoAction(env, owner.userId, action.id);
    expect(merged.action.checkedIds).toEqual(['step_1']);
    expect(merged.action.status).toBe('in_progress');
    expect(merged.action.evidenceCount).toBe(2);
    expect(merged.action.scopes.map((scope) => scope.context.engine).sort()).toEqual([
      'google_aio',
      'perplexity',
    ]);
    const dismissed = await patchGeoAction(
      env,
      owner.userId,
      action.id,
      { requestId: crypto.randomUUID(), revision: merged.action.revision, status: 'dismissed' },
      at,
    );
    await syncGeoActions(env, owner.userId, at);
    expect((await readGeoAction(env, owner.userId, action.id)).action.status).toBe('dismissed');
    expect(
      (await readGeoActions(env, owner.userId)).find((candidate) => candidate.category === 'earned')
        ?.reason,
    ).toContain('2 of 2');
    expect(dismissed.notes).toBe(body.notes);
    expect((await readGeoSources(env, owner.userId, {}, at))[0]?.competitorLinked).toBeNull();
  });
  it('validates checklist and revision, checks route ownership, and rejects reused mutation UUID payload', async () => {
    const env = bindings(),
      at = new Date(),
      owner = await seed(1, true, at),
      other = await seed(1, true, at);
    await seedGeoEvidence(env, owner, 'perplexity', at);
    await syncGeoActions(env, owner.userId, at);
    const [action] = await readGeoActions(env, owner.userId);
    if (!action) throw new Error('fixture action');
    await expect(readGeoAction(env, other.userId, action.id)).rejects.toThrow(
      'GEO_ACTION_NOT_FOUND',
    );
    await expect(
      patchGeoAction(env, owner.userId, action.id, {
        requestId: crypto.randomUUID(),
        revision: 1,
        checkedIds: ['invented'],
      }),
    ).rejects.toThrow('INVALID_CHECKLIST');
    const requestId = crypto.randomUUID();
    await patchGeoAction(
      env,
      owner.userId,
      action.id,
      { requestId, revision: 1, status: 'accepted' },
      at,
    );
    await expect(
      patchGeoAction(
        env,
        owner.userId,
        action.id,
        { requestId, revision: 1, status: 'dismissed' },
        at,
      ),
    ).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    await expect(
      patchGeoAction(
        env,
        owner.userId,
        action.id,
        { requestId: crypto.randomUUID(), revision: 1, status: 'dismissed' },
        at,
      ),
    ).rejects.toThrow('GEO_ACTION_CHANGED');
    const app = new Hono<{ Bindings: CloudflareBindings }>().route('/api/v2', v2Routes),
      headers = { Cookie: await cookie(other.userId) };
    expect(
      (
        await app.request(
          `/api/v2/geo/actions/${action.id}`,
          { headers: { Cookie: await cookie(owner.userId) } },
          env,
          createExecutionContext(),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request(
          `/api/v2/geo/actions/${action.id}`,
          { headers },
          env,
          createExecutionContext(),
        )
      ).status,
    ).toBe(404);
    const events = await env.DB.prepare('SELECT id FROM geo_action_events WHERE action_id=?')
      .bind(action.id)
      .all<{ id: string }>();
    await expect(
      env.DB.prepare("UPDATE geo_action_events SET kind='progress' WHERE id=?")
        .bind(events.results[0]?.id ?? '')
        .run(),
    ).rejects.toThrow('GEO_ACTION_EVENT_IMMUTABLE');
  });
});

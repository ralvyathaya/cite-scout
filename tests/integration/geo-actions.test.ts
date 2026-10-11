import { describe, expect, it } from 'vitest';
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
} from '../../src/server/v2/actions';
import { v2Routes } from '../../src/server/v2/routes';
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

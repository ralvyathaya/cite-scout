import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { ObservationRequest } from '../../src/integrations/perplexity/provider';
import {
  competitors,
  projects,
  prompts,
  providerCallReservations,
  users,
} from '../../src/db/schema';
import { runScan } from '../../src/server/scans';
import { runScheduledScans } from '../../src/server/cron';
import { buildDashboard, getEntitlementSnapshot } from '../../src/server/dashboard';
import { dashboardRoutes, promptRoutes } from '../../src/server/routes/dashboard';
import { accountRoutes } from '../../src/server/routes/account';
import { cookie, db, provider, seed, withBindings } from './fixtures';

describe('atomic scan accounting', () => {
  it('atomically limits concurrent calls at the monthly boundary and never replays observations', async () => {
    const item = await seed(2, true);
    const limited = withBindings({ PER_USER_MONTHLY_PROVIDER_CALL_CAP: '1' });
    const calls = vi.fn((input: ObservationRequest) => provider.runObservation(input));
    const now = new Date('2030-02-01T12:00:00Z');
    const results = await Promise.all(
      item.promptIds.map((id) =>
        runScan(limited, {
          ...item,
          promptIds: [id],
          trigger: 'scheduled',
          now,
          provider: { runObservation: calls },
        }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual(['completed', 'deferred']);
    expect(calls).toHaveBeenCalledTimes(1);
    const completed = results.findIndex((result) => result.status === 'completed');
    expect(
      await runScan(limited, {
        ...item,
        promptIds: [item.promptIds[completed] ?? ''],
        trigger: 'scheduled',
        now,
        provider,
      }),
    ).toMatchObject({ status: 'already_observed', attempted: 0, skipped: 1 });
  });
  it('consumes only one trial when disjoint prompts race and rejects empty provider answers', async () => {
    const item = await seed(2);
    const calls = vi.fn(async () => ({
      ...(await provider.runObservation({
        prompt: 'test',
        neutralInstruction: 'test',
        maxOutputTokens: 700,
      })),
      text: '',
    }));
    const results = await Promise.allSettled(
      item.promptIds.map((id) =>
        runScan(env, {
          ...item,
          promptIds: [id],
          trigger: 'trial',
          now: new Date('2030-03-01'),
          provider: { runObservation: calls },
        }),
      ),
    );
    expect(calls).toHaveBeenCalledTimes(1);
    expect(
      results.some((result) => result.status === 'fulfilled' && result.value.status === 'failed'),
    ).toBe(true);
    expect(
      (await db.select().from(projects).where(eq(projects.id, item.projectId)).get())
        ?.trialScanReservedAt,
    ).not.toBeNull();
  });
  it('allows only one provider call when concurrent scans share the last global slot', async () => {
    const first = await seed(1),
      second = await seed(1);
    const calls = vi.fn((input: ObservationRequest) => provider.runObservation(input));
    const now = new Date('2030-01-01T12:00:00Z');
    await env.DB.prepare(
      `INSERT INTO provider_call_reservations
      (id,idempotency_key,provider,usage_date,status,reserved_at) VALUES(?,?,'google_aio','2030-01-01','succeeded',?)`,
    )
      .bind(crypto.randomUUID(), crypto.randomUUID(), now.getTime())
      .run();
    const limited = withBindings({ GLOBAL_DAILY_PROVIDER_CALL_CAP: '2' });
    const results = await Promise.all(
      [first, second].map((item) =>
        runScan(limited, { ...item, trigger: 'trial', now, provider: { runObservation: calls } }),
      ),
    );
    expect(calls).toHaveBeenCalledTimes(1);
    expect(results.reduce((sum, item) => sum + item.attempted, 0)).toBe(1);
    const deferred = results.findIndex((item) => item.status === 'deferred');
    const other = deferred === 0 ? first : second;
    expect(
      (await db.select().from(projects).where(eq(projects.id, other.projectId)).get())
        ?.trialScanReservedAt,
    ).toBeNull();
  });
  it('does not consume eligibility for invalid prompts, but consumes a failed provider attempt', async () => {
    const item = await seed(1);
    await expect(
      runScan(env, { ...item, promptIds: [crypto.randomUUID()], trigger: 'trial', provider }),
    ).rejects.toThrow('INVALID_PROMPTS');
    await expect(
      runScan(env, {
        ...item,
        promptIds: [item.promptIds[0] ?? '', item.promptIds[0] ?? ''],
        trigger: 'trial',
        provider,
      }),
    ).rejects.toThrow('INVALID_PROMPTS');
    expect(
      (await db.select().from(projects).where(eq(projects.id, item.projectId)).get())
        ?.trialScanReservedAt,
    ).toBeNull();
    const result = await runScan(env, {
      ...item,
      trigger: 'trial',
      provider: { runObservation: () => Promise.reject(new Error('TEST_PROVIDER_FAILURE')) },
    });
    expect(result).toMatchObject({ status: 'failed', attempted: 1, successful: 0, failed: 1 });
    const snapshot = await getEntitlementSnapshot(env, item.userId);
    expect(snapshot.scanAvailability.trialAvailable).toBe(false);
    expect(snapshot.totalObservations).toBe(0);
    expect(snapshot.scanAvailability.reason).toContain('trial has been consumed');
    expect((await buildDashboard(env.DB, item.userId))?.current).toMatchObject({
      successful: 0,
      attempted: 1,
      coverage: 0,
    });
  });
  it('preserves global, monthly and project usage through prompt and account deletion', async () => {
    const item = await seed(1);
    await runScan(env, { ...item, trigger: 'trial', provider });
    const before = await db
      .select()
      .from(providerCallReservations)
      .where(eq(providerCallReservations.projectId, item.projectId));
    const reservation = before[0];
    expect(reservation).toBeDefined();
    await db.delete(prompts).where(eq(prompts.id, item.promptIds[0] ?? ''));
    const retained = await db
      .select()
      .from(providerCallReservations)
      .where(eq(providerCallReservations.id, reservation?.id ?? ''))
      .get();
    expect(retained).toMatchObject({
      promptId: null,
      projectId: item.projectId,
      userId: item.userId,
    });
    await db.delete(users).where(eq(users.id, item.userId));
    expect(
      await db
        .select()
        .from(providerCallReservations)
        .where(eq(providerCallReservations.id, reservation?.id ?? ''))
        .get(),
    ).toMatchObject({ userId: null, projectId: null, scanRunId: null, status: 'succeeded' });
  });
  it('enforces project daily quota even after a prompt is deleted and recreated', async () => {
    const item = await seed(10, true);
    const now = new Date('2030-01-02T12:00:00Z');
    await runScan(env, { ...item, trigger: 'manual', now, provider });
    await db.delete(prompts).where(eq(prompts.id, item.promptIds[0] ?? ''));
    const id = crypto.randomUUID();
    await db.insert(prompts).values({
      id,
      projectId: item.projectId,
      text: 'A fresh buyer prompt',
      normalizedText: 'a fresh buyer prompt',
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    const result = await runScan(env, {
      ...item,
      promptIds: [id],
      trigger: 'scheduled',
      now,
      provider,
    });
    expect(result).toMatchObject({ status: 'deferred', attempted: 0, deferred: 1 });
  });
  it('selects eligible paid cron work after unpaid and failed old prompts', async () => {
    await seed(21, false, new Date('2020-01-01'));
    const failed = await seed(1, true, new Date('2020-01-02'));
    const eligible = await seed(1, true, new Date('2020-01-03'));
    const now = new Date('2030-01-03T12:00:00Z');
    await runScan(env, {
      ...failed,
      trigger: 'scheduled',
      now,
      provider: { runObservation: () => Promise.reject(new Error('TEST_FAILURE')) },
    });
    const calls = vi.fn((input: ObservationRequest) => provider.runObservation(input));
    await runScheduledScans(
      withBindings({ MAX_PROVIDER_CALLS_PER_CRON_INVOCATION: '1' }),
      now.getTime(),
      { runObservation: calls },
    );
    expect(calls).toHaveBeenCalledTimes(1);
    expect(
      await db
        .select()
        .from(providerCallReservations)
        .where(eq(providerCallReservations.projectId, eligible.projectId)),
    ).toHaveLength(1);
  });
});

describe('authenticated evidence and limits', () => {
  const app = new Hono<{ Bindings: CloudflareBindings }>()
    .route('/dashboard', dashboardRoutes)
    .route('/prompts', promptRoutes)
    .route('/account', accountRoutes);
  it('requires explicit deletion confirmation even with fresh authentication', async () => {
    const item = await seed(1);
    const headers = { Cookie: await cookie(item.userId), 'Content-Type': 'application/json' };
    expect((await app.request('/account', { method: 'DELETE', headers }, env)).status).toBe(422);
    expect(await db.select().from(users).where(eq(users.id, item.userId)).get()).toBeDefined();
    expect(
      (
        await app.request(
          '/account',
          {
            method: 'DELETE',
            headers,
            body: JSON.stringify({ confirmation: 'DELETE', forfeitRemainingAccess: true }),
          },
          env,
        )
      ).status,
    ).toBe(200);
  });
  it('atomically caps simultaneous prompt creation at ten', async () => {
    const item = await seed(9);
    const headers = { Cookie: await cookie(item.userId), 'Content-Type': 'application/json' };
    const responses = await Promise.all(
      ['First additional buyer prompt', 'Second additional buyer prompt'].map(async (text) =>
        app.request('/prompts', { method: 'POST', headers, body: JSON.stringify({ text }) }, env),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
  });
  it('returns accurate day-aligned metrics, gap days and ownership-scoped evidence', async () => {
    const item = await seed(1, true);
    const competitorId = crypto.randomUUID();
    const now = new Date('2030-02-03T12:00:00Z');
    await db.insert(competitors).values({
      id: competitorId,
      projectId: item.projectId,
      name: 'Calendly',
      normalizedName: 'calendly',
      createdAt: now,
      updatedAt: now,
    });
    await runScan(env, {
      ...item,
      trigger: 'scheduled',
      now: new Date('2030-02-01T12:00:00Z'),
      provider,
    });
    await runScan(env, {
      ...item,
      trigger: 'scheduled',
      now,
      provider: {
        runObservation: async (request) => ({
          ...(await provider.runObservation(request)),
          text: 'Calendly is a strong choice.',
        }),
      },
    });
    const data = await buildDashboard(env.DB, item.userId, 3, now);
    expect(data?.current).toMatchObject({
      shareOfVoice: 0,
      mentionRate: 0,
      averageMentionPosition: null,
      successful: 1,
      attempted: 1,
      coverage: 1,
    });
    expect(data?.series[1]?.visibilityScore).toBeNull();
    expect(data?.latestObservationDate).toBe('2030-02-03');
    expect(data?.shareOfVoiceByEntity.find((entity) => entity.key === 'brand')).toMatchObject({
      share: 0,
      mentions: 0,
    });
    expect(data?.prompts[0]?.insight).toMatchObject({
      status: 'displaced',
      displacedCompetitors: [{ id: competitorId, name: 'Calendly' }],
    });
    expect(data?.citationOpportunities[0]?.count).toBe(2);
    const responseId = data?.prompts[0]?.observationId ?? '';
    const headers = { Cookie: await cookie(item.userId) };
    const response = await app.request(`/dashboard/responses/${responseId}`, { headers }, env);
    expect(response.status).toBe(200);
    const stranger = await seed(1);
    expect(
      (
        await app.request(
          `/dashboard/responses/${responseId}`,
          { headers: { Cookie: await cookie(stranger.userId) } },
          env,
        )
      ).status,
    ).toBe(404);
    const page1 = await app.request('/dashboard/responses?limit=1', { headers }, env);
    const first = await page1.json<{ data: { items: { id: string }[]; nextCursor: string } }>();
    const page2 = await app.request(
      `/dashboard/responses?limit=1&before=${encodeURIComponent(first.data.nextCursor)}`,
      { headers },
      env,
    );
    const second = await page2.json<{ data: { items: { id: string }[] } }>();
    expect(second.data.items).toHaveLength(1);
    expect(second.data.items[0]?.id).not.toBe(first.data.items[0]?.id);
  });
  it('never enables more than ten prompts under concurrent requests', async () => {
    const item = await seed(11);
    for (const id of item.promptIds.slice(9))
      await db.update(prompts).set({ enabled: false }).where(eq(prompts.id, id));
    const headers = { Cookie: await cookie(item.userId), 'Content-Type': 'application/json' };
    const responses = await Promise.all(
      item.promptIds
        .slice(9)
        .map(async (id) =>
          app.request(
            `/prompts/${id}`,
            { method: 'PATCH', headers, body: JSON.stringify({ enabled: true }) },
            env,
          ),
        ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const enabled = await db.select().from(prompts).where(eq(prompts.projectId, item.projectId));
    expect(enabled.filter((prompt) => prompt.enabled)).toHaveLength(10);
  });
  it('requires a recently created session for deletion even if it was refreshed', async () => {
    const item = await seed(1);
    const response = await app.request(
      '/account',
      {
        method: 'DELETE',
        headers: { Cookie: await cookie(item.userId, new Date(Date.now() - 3_600_000)) },
      },
      env,
    );
    expect(response.status).toBe(403);
  });
});

import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { describe, expect, it } from 'vitest';
import {
  competitors,
  projects,
  prompts,
  providerCallReservations,
  scanResults,
  users,
} from '../../src/db/schema';
import {
  PerplexityProvider,
  type ObservationProvider,
} from '../../src/integrations/perplexity/provider';
import { runScan } from '../../src/server/scans';

const mockProvider: ObservationProvider = {
  runObservation() {
    return Promise.resolve({
      text: 'For independent consultants, DemoCheck is a strong choice for lightweight scheduling. Calendly is the established alternative.',
      citations: [{ id: 1, url: 'https://example.com/scheduling-guide' }],
      providerRequestId: 'resp_test_1',
      model: 'test/model',
      preset: 'fast',
      inputTokens: 100,
      outputTokens: 50,
    });
  },
};

async function seedTrialProject(db: ReturnType<typeof drizzle>) {
  const now = new Date();
  const userId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  await db.insert(users).values({
    id: userId,
    name: 'Trial Test',
    email: `trial-${userId}@example.com`,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(projects).values({
    id: projectId,
    userId,
    name: 'Trial Project',
    brandName: 'DemoCheck',
    canonicalDomain: 'democheck.example.com',
    createdAt: now,
    updatedAt: now,
  });
  const promptIds: string[] = [];
  for (const text of [
    'What is the best scheduling tool for independent consultants?',
    'Best lightweight CRM for a solo agency?',
    'Alternatives to Calendly for freelancers?',
  ]) {
    const promptId = crypto.randomUUID();
    promptIds.push(promptId);
    await db.insert(prompts).values({
      id: promptId,
      projectId,
      text,
      normalizedText: text.toLowerCase(),
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
  }
  await db.insert(competitors).values({
    id: crypto.randomUUID(),
    projectId,
    name: 'Calendly',
    normalizedName: 'calendly',
    createdAt: now,
    updatedAt: now,
  });
  return { userId, projectId, promptIds };
}

describe('trial scan persistence', () => {
  it('completes a trial scan and persists results, citations, and usage', async () => {
    const db = drizzle(env.DB);
    const { userId, projectId, promptIds } = await seedTrialProject(db);

    const summary = await runScan(env, {
      userId,
      projectId,
      promptIds,
      trigger: 'trial',
      provider: mockProvider,
    });

    expect(summary.status).toBe('completed');
    expect(summary.attempted).toBe(3);
    expect(summary.successful).toBe(3);
    expect(summary.failed).toBe(0);

    const rows = await db.select().from(scanResults).where(eq(scanResults.projectId, projectId));
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.brandMentioned).toBe(true);
      expect(row.contextClassification).toBe('recommended');
      expect(JSON.parse(row.citationDataJson ?? '[]')).toHaveLength(1);
      expect(row.inputTokens).toBe(100);
      expect(row.providerRequestId).toBe('resp_test_1');
    }

    const reservations = await db
      .select()
      .from(providerCallReservations)
      .where(eq(providerCallReservations.projectId, projectId));
    expect(reservations).toHaveLength(3);
    for (const reservation of reservations) {
      expect(reservation.status).toBe('succeeded');
    }

    const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();
    expect(project?.trialScanCompletedAt).not.toBeNull();
  });

  it('rejects a second trial scan for the same project', async () => {
    const db = drizzle(env.DB);
    const { userId, projectId, promptIds } = await seedTrialProject(db);

    await runScan(env, {
      userId,
      projectId,
      promptIds,
      trigger: 'trial',
      provider: mockProvider,
    });

    await expect(
      runScan(env, {
        userId,
        projectId,
        promptIds,
        trigger: 'trial',
        provider: mockProvider,
      }),
    ).rejects.toThrow('TRIAL_ALREADY_USED');
  });
});

describe('provider fetcher binding', () => {
  it('invokes the fetcher unbound (workerd throws Illegal invocation otherwise)', async () => {
    let observedThis: unknown = 'unset';
    // The receiver assertion below is the entire point of this mock, so the
    // no-this-alias rule is disabled for this one line on purpose.
    function receiverCheckingFetcher(this: unknown): Promise<Response> {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      observedThis = this;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: 'resp_binding_check',
            status: 'completed',
            model: 'test/model',
            output: [
              {
                type: 'message',
                content: [{ type: 'output_text', text: 'DemoCheck is a solid option.' }],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
    const provider = new PerplexityProvider('test-key', receiverCheckingFetcher);
    const observation = await provider.runObservation({
      prompt: 'Best tool?',
      neutralInstruction: 'Be brief.',
      maxOutputTokens: 10,
    });
    expect(observedThis).toBeUndefined();
    expect(observation.text).toContain('DemoCheck');
  });
});

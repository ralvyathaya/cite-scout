import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteAccountData } from '../../src/server/account-deletion';
import { seed, withBindings } from './fixtures';
import { saveGeoSettings, startGeoRun } from '../../src/server/v2/geo-store';
import {
  queueGeoAnalysis,
  queueGeoPageCheck,
  processGeoAnalysis,
  readGeoAnalyses,
} from '../../src/server/v2/analysis';
import { buildGeoEvaluation } from '../../src/domain/geo-classification';
import { readGeoObservation } from '../../src/server/v2/geo-store';
import { geoUsage } from '../../src/server/v2/geo-readiness';
const at = new Date('2026-10-11T10:00:00Z');
const fixtureOwners: { env: CloudflareBindings; userId: string }[] = [];
afterEach(async () => {
  for (const owner of fixtureOwners) {
    await owner.env.DB.prepare('DELETE FROM subscriptions WHERE user_id=?')
      .bind(owner.userId)
      .run();
    await deleteAccountData(owner.env, owner.userId);
  }
  fixtureOwners.length = 0;
});
async function capture() {
  const env = withBindings({
      GEO_SCANS_ENABLED: 'true',
      EXTERNAL_INTEGRATIONS_ENABLED: 'true',
      V2_SCANS_ENABLED: 'true',
      GEO_GLOBAL_DAILY_CALL_CAP: '100',
      GEO_PROJECT_DAILY_CALL_CAP: '40',
      GEO_PROJECT_MONTHLY_CALL_CAP: '100',
      GEO_ANALYSIS_ENABLED: 'true',
      GEO_CLASSIFIER_MODEL: 'clef-flash',
      GEO_PROCESSING_PROJECT_DAILY_CAP: '10',
      GEO_PROCESSING_GLOBAL_DAILY_CAP: '30',
    }),
    owner = await seed(1, true, at);
  await saveGeoSettings(
    env,
    owner.userId,
    {
      engines: ['google_aio'],
      dailyEnabled: false,
      languageCode: 'en',
      locationCode: 2840,
      device: 'desktop',
    },
    at,
  );
  const run = await startGeoRun(env, owner.userId, { requestId: crypto.randomUUID() }, at),
    item = run.items[0];
  if (!item) throw new Error('fixture item');
  const id = crypto.randomUUID(),
    text = 'Rival is recommended.';
  await env.DB.prepare(
    "INSERT INTO geo_observations(id,project_id,run_id,item_id,prompt_version_id,engine,model,status,context_json,capture_json,answer_text,captured_at) VALUES(?,?,?,?,?,? ,NULL,'captured',?,?,?,?)",
  )
    .bind(
      id,
      owner.projectId,
      run.id,
      item.id,
      item.context.promptVersionId,
      item.engine,
      JSON.stringify(item.context),
      JSON.stringify({
        schemaVersion: 'geo-capture-1',
        answerText: text,
        raw: { original: true },
        model: null,
        modelReported: false,
        sources: [],
        quality: 'complete',
        providerRequestId: 'saved',
        providerStatus: '20000',
        reportedCost: 0,
        inputTokens: null,
        outputTokens: null,
        textParts: [],
      }),
      text,
      at.getTime(),
    )
    .run();
  fixtureOwners.push({ env, userId: owner.userId });
  return { env, owner, id };
}
describe('independent analysis budget and stored capture recovery', () => {
  it('checks actual processing-day quota across midnight without changing request time or repeating inference', async () => {
    const { env, owner, id } = await capture();
    const first = await queueGeoAnalysis(env, owner.userId, id, crypto.randomUUID(), at);
    const next = new Date('2026-10-12T00:00:00Z');
    const capped = {
      ...env,
      GEO_PAGE_CHECKS_ENABLED: 'true',
      GEO_PROCESSING_GLOBAL_DAILY_CAP: '1',
      GEO_PROCESSING_PROJECT_DAILY_CAP: '1',
    };
    await queueGeoPageCheck(
      capped,
      owner.userId,
      id,
      'https://orbitcal.test/',
      crypto.randomUUID(),
      next,
    );
    const run = vi.fn().mockResolvedValue({ broken: true });
    await processGeoAnalysis({ ...capped, AI: { run } as unknown as Ai }, 1, next);
    expect(run).not.toHaveBeenCalled();
    expect(
      (await readGeoAnalyses(env, owner.userId, id)).find((row) => row.id === first.id)?.state,
    ).toBe('queued');
    const later = new Date('2026-10-13T00:00:00Z');
    await processGeoAnalysis({ ...capped, AI: { run } as unknown as Ai }, 1, later);
    expect(run).toHaveBeenCalledTimes(1);
    expect(
      await env.DB.prepare('SELECT created_at,usage_date FROM geo_processing_attempts WHERE id=?')
        .bind(first.id)
        .first(),
    ).toEqual({ created_at: at.getTime(), usage_date: '2026-10-13' });
    expect((await geoUsage(env, owner.userId, later)).processing.today).toBe(1);
    await processGeoAnalysis({ ...capped, AI: { run } as unknown as Ai }, 1, later);
    expect(run).toHaveBeenCalledTimes(1);
    expect((await readGeoObservation(env, owner.userId, id)).capture.raw).toEqual({
      original: true,
    });
  });
  it('scrubs private processing data on deletion and keeps anonymous budget usage despite late classifier output', async () => {
    const { env, owner, id } = await capture();
    const attempt = await queueGeoAnalysis(env, owner.userId, id, crypto.randomUUID(), at);
    const run = vi.fn().mockImplementation(async () => {
      await env.DB.prepare('DELETE FROM subscriptions WHERE user_id=?').bind(owner.userId).run();
      await deleteAccountData(env, owner.userId);
      return { broken: true };
    });
    await processGeoAnalysis({ ...env, AI: { run } as unknown as Ai }, 1, at);
    expect(
      await env.DB.prepare(
        'SELECT project_id,input_json,result_json,failure_code FROM geo_processing_attempts WHERE id=?',
      )
        .bind(attempt.id)
        .first(),
    ).toMatchObject({
      project_id: null,
      input_json: '{}',
      result_json: null,
      failure_code: 'ACCOUNT_DELETED',
    });
    expect(run).toHaveBeenCalledTimes(1);
  });
  it('does not return an expired page cache when a fresh verification exceeds budget', async () => {
    const { env, owner, id } = await capture();
    const capped = {
      ...env,
      GEO_ANALYSIS_ENABLED: 'false',
      GEO_PAGE_CHECKS_ENABLED: 'true',
      GEO_PROCESSING_PROJECT_DAILY_CAP: '1',
    };
    const first = await queueGeoPageCheck(
      capped,
      owner.userId,
      id,
      'https://orbitcal.test/',
      crypto.randomUUID(),
      at,
    );
    await processGeoAnalysis(capped, 1, at);
    expect(
      (
        await queueGeoPageCheck(
          capped,
          owner.userId,
          id,
          'https://orbitcal.test/',
          crypto.randomUUID(),
          at,
        )
      ).id,
    ).toBe(first.id);
    await expect(
      queueGeoPageCheck(
        capped,
        owner.userId,
        id,
        'https://orbitcal.test/',
        crypto.randomUUID(),
        new Date(at.getTime() + 3600_001),
      ),
    ).rejects.toThrow('GEO_PROCESSING_QUOTA_EXCEEDED');
  });
  it('persists an analysis identity for each fresh observation even when text is identical', async () => {
    const { env, owner, id } = await capture();
    const first = await queueGeoAnalysis(env, owner.userId, id, crypto.randomUUID(), at);
    await env.DB.prepare("UPDATE geo_run_items SET status='succeeded' WHERE project_id=?")
      .bind(owner.projectId)
      .run();
    const run = await startGeoRun(
        env,
        owner.userId,
        { requestId: crypto.randomUUID() },
        new Date(at.getTime() + 301_000),
      ),
      item = run.items[0];
    if (!item) throw new Error('fixture item');
    const secondId = crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO geo_observations(id,project_id,run_id,item_id,prompt_version_id,engine,model,status,context_json,capture_json,answer_text,captured_at) SELECT ?,project_id,?,?,prompt_version_id,engine,model,status,context_json,capture_json,answer_text,? FROM geo_observations WHERE id=?',
    )
      .bind(secondId, run.id, item.id, at.getTime() + 301_000, id)
      .run();
    const second = await queueGeoAnalysis(
      env,
      owner.userId,
      secondId,
      crypto.randomUUID(),
      new Date(at.getTime() + 301_000),
    );
    expect(second.id).not.toBe(first.id);
    expect(second.observationId).toBe(secondId);
  });
  it('retains raw on malformed model output and retries only analysis, reusing successful cache', async () => {
    const { env, owner, id } = await capture();
    const observation = await readGeoObservation(env, owner.userId, id),
      evaluation = buildGeoEvaluation(observation);
    const native = {
      model: 'clef-flash',
      usage: { input_tokens: 100, output_tokens: 0 },
      answers: Object.fromEntries(
        Object.entries(evaluation.questions).map(([name, q]) => [
          name,
          q.type === 'noul'
            ? { type: 'noul', noul: 0.9 }
            : {
                type: 'choice',
                choice: name === 'brand_presence' ? 'absent' : Object.keys(q.criteria)[0],
                confidence: 0.9,
                probabilities: Object.fromEntries(
                  Object.keys(q.criteria).map((option) => [
                    option,
                    option === (name === 'brand_presence' ? 'absent' : Object.keys(q.criteria)[0])
                      ? 1
                      : 0,
                  ]),
                ),
              },
        ]),
      ),
    };
    const run = vi.fn().mockResolvedValueOnce({ broken: true }).mockResolvedValueOnce(native);
    const classifierEnv = { ...env, AI: { run } as unknown as Ai };
    const requestId = crypto.randomUUID();
    const first = await queueGeoAnalysis(classifierEnv, owner.userId, id, requestId, at);
    expect((await queueGeoAnalysis(classifierEnv, owner.userId, id, requestId, at)).id).toBe(
      first.id,
    );
    await processGeoAnalysis(classifierEnv, 1, at);
    expect((await readGeoAnalyses(env, owner.userId, id))[0]?.state).toBe('failed');
    expect((await readGeoObservation(env, owner.userId, id)).capture.raw).toEqual({
      original: true,
    });
    await queueGeoAnalysis(classifierEnv, owner.userId, id, crypto.randomUUID(), at);
    await processGeoAnalysis(classifierEnv, 1, at);
    const completed = (await readGeoAnalyses(env, owner.userId, id)).find(
      (row) => row.state === 'completed',
    );
    expect(await readGeoAnalyses(env, owner.userId, id)).toEqual(
      expect.arrayContaining([expect.objectContaining({ state: 'completed', failureCode: null })]),
    );
    expect(completed?.diagnoses[0]?.status).toBe('suspected');
    expect(
      (await queueGeoAnalysis(classifierEnv, owner.userId, id, crypto.randomUUID(), at)).id,
    ).toBe(completed?.id);
    expect(run).toHaveBeenCalledTimes(2);
    expect(
      await env.DB.prepare('SELECT count(*) FROM provider_call_reservations WHERE project_id=?')
        .bind(owner.projectId)
        .first('count(*)'),
    ).toBe(1);
  });
  it('checks tenant ownership and reserves a whole processing budget atomically', async () => {
    const { env, owner, id } = await capture(),
      other = await seed(1, true, at);
    await expect(queueGeoAnalysis(env, other.userId, id, crypto.randomUUID(), at)).rejects.toThrow(
      'GEO_OBSERVATION_NOT_FOUND',
    );
    const capped = { ...env, GEO_PROCESSING_PROJECT_DAILY_CAP: '1' };
    const results = await Promise.allSettled([
      queueGeoAnalysis(capped, owner.userId, id, crypto.randomUUID(), at),
      queueGeoAnalysis(capped, owner.userId, id, crypto.randomUUID(), at),
    ]);
    expect(
      await env.DB.prepare('SELECT count(*) FROM geo_processing_attempts WHERE project_id=?')
        .bind(owner.projectId)
        .first('count(*)'),
    ).toBe(1);
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
  });
});

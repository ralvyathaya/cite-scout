import { z } from 'zod';
import { getConfig } from '../config';
import { ownedProject } from './read-model';
import {
  generateOnboardingDraft,
  onboardingWebsite,
  readWebsiteProfile,
} from '../../integrations/onboarding';
import {
  onboardingModel,
  onboardingSuggestionVersion,
  type OnboardingSuggestion,
} from '../../shared/onboarding';

export const onboardingRequest = z.strictObject({
  website: z.string().trim().min(1).max(253),
  requestId: z.uuid(),
});
const DAY = 86_400_000;
interface StoredSuggestion {
  id: string;
  source_key: string;
  state: string;
  draft_json: string | null;
}
export interface OnboardingProvider {
  readWebsiteProfile: typeof readWebsiteProfile;
  generateOnboardingDraft: typeof generateOnboardingDraft;
  synthetic: boolean;
}
const productionProvider: OnboardingProvider = {
  readWebsiteProfile,
  generateOnboardingDraft,
  synthetic: false,
};

export async function suggestWebsiteSetup(
  env: CloudflareBindings,
  userId: string,
  input: z.infer<typeof onboardingRequest>,
  provider: OnboardingProvider = productionProvider,
  now = new Date(),
): Promise<OnboardingSuggestion> {
  const config = getConfig(env);
  if (await ownedProject(env, userId)) throw new Error('SETUP_ALREADY_COMPLETE');
  const target = onboardingWebsite(input.website);
  const sourceKey = `${onboardingSuggestionVersion}:${target.domain}`;
  const timestamp = now.getTime();
  const replay = await env.DB.prepare(
    'SELECT id,source_key,state,draft_json FROM onboarding_suggestions WHERE id=? AND user_id=?',
  )
    .bind(input.requestId, userId)
    .first<StoredSuggestion>();
  if (replay) {
    if (replay.source_key !== sourceKey) throw new Error('SUGGESTION_REQUEST_CONFLICT');
    if (replay.state === 'succeeded' && replay.draft_json)
      return { ...(JSON.parse(replay.draft_json) as OnboardingSuggestion), cached: true };
    throw new Error(
      replay.state === 'reserved' ? 'SUGGESTIONS_IN_PROGRESS' : 'SUGGESTION_PREVIOUSLY_FAILED',
    );
  }
  const cached = await env.DB.prepare(
    `SELECT draft_json FROM onboarding_suggestions
    WHERE user_id=? AND source_key=? AND state='succeeded' AND draft_json IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(userId, sourceKey)
    .first<{ draft_json: string }>();
  if (cached) return { ...(JSON.parse(cached.draft_json) as OnboardingSuggestion), cached: true };
  const apiKey = z.string().trim().min(1).safeParse(env.OPENAI_API_KEY);
  const totalBudget = Math.floor(config.ONBOARDING_SUGGESTIONS_TOTAL_BUDGET_USD * 1_000_000);
  if (config.ONBOARDING_SUGGESTIONS_DAILY_CAP === 0 || totalBudget === 0 || !apiKey.success)
    throw new Error('SUGGESTIONS_UNAVAILABLE');
  const dayStart = Math.floor(timestamp / DAY) * DAY;
  await env.DB.prepare(
    `UPDATE onboarding_suggestions SET state='failed',error_code='SUGGESTION_EXPIRED',completed_at=?
    WHERE user_id=? AND state='reserved' AND created_at<?`,
  )
    .bind(timestamp, userId, timestamp - 60_000)
    .run();
  const reservation = await env.DB.prepare(
    `INSERT OR IGNORE INTO onboarding_suggestions
    (id,user_id,source_key,state,created_at,model,reserved_cost_microusd)
    SELECT ?,?,?,'reserved',?,?,10000
    WHERE (SELECT count(*) FROM onboarding_suggestions WHERE user_id=? AND created_at>=?)<3
    AND (SELECT count(*) FROM onboarding_suggestions WHERE created_at>=?)<?
    AND (SELECT coalesce(sum(reserved_cost_microusd),0) FROM onboarding_suggestions)<=?-10000`,
  )
    .bind(
      input.requestId,
      userId,
      sourceKey,
      timestamp,
      onboardingModel,
      userId,
      dayStart,
      dayStart,
      config.ONBOARDING_SUGGESTIONS_DAILY_CAP,
      totalBudget,
    )
    .run();
  if (!reservation.meta.changes) throw new Error('SUGGESTION_LIMIT_REACHED');
  let started = false;
  try {
    const source = await provider.readWebsiteProfile(target.url);
    const dispatch = await env.DB.prepare(
      "UPDATE onboarding_suggestions SET provider_started_at=? WHERE id=? AND user_id=? AND state='reserved' AND provider_started_at IS NULL",
    )
      .bind(Date.now(), input.requestId, userId)
      .run();
    if (!dispatch.meta.changes) throw new Error('SUGGESTION_RESERVATION_LOST');
    started = true;
    const result = await provider.generateOnboardingDraft(apiKey.data, source);
    const suggestion: OnboardingSuggestion = {
      draft: result.draft,
      source,
      generatedAt: new Date().toISOString(),
      model: result.model,
      version: onboardingSuggestionVersion,
      synthetic: provider.synthetic,
      cached: false,
    };
    const saved = await env.DB.prepare(
      `UPDATE onboarding_suggestions SET state='succeeded',completed_at=?,model=?,input_tokens=?,output_tokens=?,estimated_cost_microusd=?,draft_json=?
      WHERE id=? AND user_id=? AND state='reserved'`,
    )
      .bind(
        Date.now(),
        result.model,
        result.inputTokens,
        result.outputTokens,
        result.estimatedCostUsd === null ? null : Math.ceil(result.estimatedCostUsd * 1_000_000),
        JSON.stringify(suggestion),
        input.requestId,
        userId,
      )
      .run();
    if (!saved.meta.changes) throw new Error('SUGGESTION_SAVE_FAILED');
    return suggestion;
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z_]+$/u.test(error.message)
        ? error.message
        : 'SUGGESTION_FAILED';
    await env.DB.prepare(
      `UPDATE onboarding_suggestions SET state='failed',completed_at=?,error_code=?,estimated_cost_microusd=?
      WHERE id=? AND user_id=? AND state='reserved'`,
    )
      .bind(Date.now(), code, started ? null : 0, input.requestId, userId)
      .run();
    throw new Error(
      [
        'UNSAFE_PAGE_TARGET',
        'NON_PUBLIC_DNS',
        'WEBSITE_UNREADABLE',
        'WEBSITE_TOO_LITTLE_TEXT',
      ].includes(code)
        ? code
        : 'SUGGESTION_FAILED',
      { cause: error },
    );
  }
}

import { z } from 'zod';

export const onboardingSuggestionVersion = 'website-setup-1';
export const onboardingModel = 'gpt-6-luna';
export const onboardingDraftSchema = z.strictObject({
  brandName: z.string().trim().min(1).max(80),
  brandEvidence: z.string().trim().min(1).max(280),
  category: z.string().trim().min(1).max(140),
  competitors: z
    .array(
      z.strictObject({
        name: z.string().trim().min(1).max(80),
        reason: z.string().trim().min(1).max(240),
      }),
    )
    .min(1)
    .max(3),
  questions: z
    .array(
      z.strictObject({
        text: z.string().trim().min(10).max(500),
        reason: z.string().trim().min(1).max(240),
      }),
    )
    .length(3),
});
export interface WebsiteProfile {
  url: string;
  domain: string;
  title: string;
  description: string;
  text: string;
}
export interface OnboardingSuggestion {
  draft: z.infer<typeof onboardingDraftSchema>;
  source: WebsiteProfile;
  generatedAt: string;
  model: string;
  version: string;
  synthetic: boolean;
  cached: boolean;
}

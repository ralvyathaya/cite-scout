import type { OnboardingSuggestion } from './onboarding';

/** Synthetic only: never an extracted website, a provider response, or a visibility result. */
export const syntheticOnboardingSuggestion: OnboardingSuggestion = {
  draft: {
    brandName: 'CedarFlow',
    brandEvidence: 'CedarFlow helps small teams manage customer onboarding.',
    category: 'Customer onboarding software',
    competitors: [
      { name: 'Rival', reason: 'Illustrative alternative for small-team onboarding workflows.' },
      {
        name: 'OtherFlow',
        reason: 'Illustrative alternative with workflow and checklist features.',
      },
    ],
    questions: [
      {
        text: 'Which customer onboarding tools work for a small B2B SaaS team?',
        reason: 'Tests buyer fit for the audience described on the example homepage.',
      },
      {
        text: 'How do customer onboarding tools compare for teams with a limited budget?',
        reason: 'Draft comparison question about a common buying constraint.',
      },
      {
        text: 'What should a small team look for when choosing customer onboarding software?',
        reason: 'Draft selection question about the category.',
      },
    ],
  },
  source: {
    url: 'https://cedarflow.example/',
    domain: 'cedarflow.example',
    title: 'CedarFlow',
    description: 'CedarFlow helps small teams manage customer onboarding.',
    text: 'CedarFlow helps small teams manage customer onboarding. Manage workflows and checklists for B2B SaaS teams.',
  },
  generatedAt: '2026-10-17T00:00:00Z',
  model: 'synthetic-fixture',
  version: 'website-setup-1',
  synthetic: true,
  cached: false,
};

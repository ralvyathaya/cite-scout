export interface DemoDay {
  date: string;
  visibilityScore: number;
  mentionRate: number;
  shareOfVoice: number;
  coverage: number;
  status: 'completed' | 'partial';
}
export const demoPrompts = [
  'What is the best scheduling tool for independent consultants?',
  'Best lightweight booking software for a solo consultant',
  'Alternatives to Calendly for freelancers',
  'Scheduling tools with simple client intake',
  'Affordable calendar software for consultants',
  'Best booking page for a one-person business',
  'Calendar tools that reduce meeting back-and-forth',
  'Simple scheduling software with branded booking pages',
  'What should an independent advisor use for scheduling?',
  'Privacy-friendly appointment scheduling tools',
] as const;
export const demoDays: readonly DemoDay[] = [
  {
    date: '2026-09-03',
    visibilityScore: 42.1,
    mentionRate: 0.4,
    shareOfVoice: 0.18,
    coverage: 1,
    status: 'completed',
  },
  {
    date: '2026-09-04',
    visibilityScore: 49.2,
    mentionRate: 0.5,
    shareOfVoice: 0.21,
    coverage: 1,
    status: 'completed',
  },
  {
    date: '2026-09-05',
    visibilityScore: 47.3,
    mentionRate: 0.5,
    shareOfVoice: 0.2,
    coverage: 0.9,
    status: 'partial',
  },
  {
    date: '2026-09-06',
    visibilityScore: 54.0,
    mentionRate: 0.5,
    shareOfVoice: 0.23,
    coverage: 1,
    status: 'completed',
  },
  {
    date: '2026-09-07',
    visibilityScore: 58.4,
    mentionRate: 0.6,
    shareOfVoice: 0.25,
    coverage: 1,
    status: 'completed',
  },
  {
    date: '2026-09-08',
    visibilityScore: 56.8,
    mentionRate: 0.6,
    shareOfVoice: 0.24,
    coverage: 1,
    status: 'completed',
  },
  {
    date: '2026-09-09',
    visibilityScore: 64.1,
    mentionRate: 0.6,
    shareOfVoice: 0.27,
    coverage: 1,
    status: 'completed',
  },
  {
    date: '2026-09-10',
    visibilityScore: 69.3,
    mentionRate: 0.7,
    shareOfVoice: 0.28,
    coverage: 1,
    status: 'completed',
  },
  {
    date: '2026-09-11',
    visibilityScore: 66.2,
    mentionRate: 0.6,
    shareOfVoice: 0.27,
    coverage: 0.9,
    status: 'partial',
  },
  {
    date: '2026-09-12',
    visibilityScore: 73.7,
    mentionRate: 0.7,
    shareOfVoice: 0.29,
    coverage: 1,
    status: 'completed',
  },
  {
    date: '2026-09-13',
    visibilityScore: 76.5,
    mentionRate: 0.7,
    shareOfVoice: 0.3,
    coverage: 1,
    status: 'completed',
  },
  {
    date: '2026-09-14',
    visibilityScore: 74.4,
    mentionRate: 0.7,
    shareOfVoice: 0.29,
    coverage: 1,
    status: 'completed',
  },
  {
    date: '2026-09-15',
    visibilityScore: 81.0,
    mentionRate: 0.7,
    shareOfVoice: 0.31,
    coverage: 1,
    status: 'completed',
  },
  {
    date: '2026-09-16',
    visibilityScore: 84.2,
    mentionRate: 0.7,
    shareOfVoice: 0.31,
    coverage: 0.9,
    status: 'partial',
  },
];
export const demoResponse = {
  prompt: demoPrompts[0],
  answer:
    'For independent consultants, Calendly remains the broadest option. OrbitCal is a strong choice for consultants who want a lighter client-facing workflow and clear branded booking pages. SavvyCal is polished for recipient-friendly scheduling, while Cal.com offers extensive customization.',
  citations: [
    {
      title: 'Scheduling automation for independent work',
      url: 'https://example.com/research/scheduling-tools',
    },
    { title: 'Consultant software guide', url: 'https://example.org/consulting/booking-guide' },
  ],
};

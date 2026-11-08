import { z } from 'zod';

export const feedbackRecipient = 'support@cite-scout.com';
export const feedbackMessageMinimum = 10;
export const feedbackMessageLimit = 3000;

export const feedbackSchema = z
  .object({
    requestId: z.uuid(),
    kind: z.enum(['bug', 'idea', 'other']),
    message: z.string().trim().min(feedbackMessageMinimum).max(feedbackMessageLimit),
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)).optional(),
    page: z
      .string()
      .max(240)
      .regex(/^\/app(?:\/[a-zA-Z0-9_-]+)*\/?$/),
  })
  .strict();

export type FeedbackInput = z.infer<typeof feedbackSchema>;

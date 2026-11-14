import { Resend } from 'resend';
import { feedbackRecipient, type FeedbackInput } from '../../shared/feedback';

export async function sendMagicLinkEmail(input: {
  apiKey: string;
  from: string;
  to: string;
  url: string;
}): Promise<void> {
  const resend = new Resend(input.apiKey);
  const escaped = input.url
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  const { error } = await resend.emails.send({
    from: input.from,
    to: [input.to],
    subject: 'Your CiteScout sign-in link',
    html: `<p>Sign in to CiteScout:</p><p><a href="${escaped}">Open CiteScout</a></p><p>This single-use link expires shortly.</p>`,
    text: `Sign in to CiteScout: ${input.url}`,
  });
  if (error) throw new Error('EMAIL_DELIVERY_FAILED');
}

export async function sendFeedbackEmail(input: {
  apiKey: string;
  from: string;
  appUrl: string;
  userId: string;
  feedback: FeedbackInput;
}): Promise<void> {
  const { feedback } = input;
  const origin = new URL(input.appUrl).origin;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
      // shortcut: Resend deduplicates for 24h; persist receipts if retries must survive longer.
      'Idempotency-Key': `feedback/${input.userId}/${feedback.requestId}`,
    },
    body: JSON.stringify({
      from: input.from,
      to: [feedbackRecipient],
      ...(feedback.email ? { reply_to: feedback.email } : {}),
      subject: `CiteScout feedback: ${feedback.kind} (${new URL(origin).hostname})`,
      text: [
        `Category: ${feedback.kind}`,
        `Page: ${origin}${feedback.page}`,
        `Account: ${input.userId}`,
        `Reply email: ${feedback.email ?? 'Not provided'}`,
        '',
        feedback.message,
      ].join('\n'),
    }),
  });
  if (!response.ok) throw new Error('EMAIL_DELIVERY_FAILED');
  const result: unknown = await response.json();
  if (
    !result ||
    typeof result !== 'object' ||
    !('id' in result) ||
    typeof result.id !== 'string' ||
    !result.id
  )
    throw new Error('EMAIL_DELIVERY_FAILED');
}

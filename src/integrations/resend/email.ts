import { Resend } from 'resend';

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

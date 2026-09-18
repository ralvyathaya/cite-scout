import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/d1';
import { schema } from '../db/schema';
import { sendMagicLinkEmail } from '../integrations/resend/email';
import { getConfig } from './config';

export function createAuth(env: CloudflareBindings) {
  const config = getConfig(env);
  const db = drizzle(env.DB, { schema });
  return betterAuth({
    appName: 'CiteScout',
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: 'sqlite', schema, usePlural: true }),
    trustedOrigins: [new URL(env.APP_URL).origin],
    emailAndPassword: { enabled: false },
    advanced: { useSecureCookies: config.APP_ENV === 'production' },
    plugins: [
      magicLink({
        expiresIn: 600,
        storeToken: 'hashed',
        rateLimit: { window: 60, max: 5 },
        sendMagicLink: async ({ email, url }) => {
          if (config.APP_ENV === 'test') return;
          // Local-dev login: TEST_AUTH_ENABLED can only be true outside
          // production (getConfig throws otherwise), so printing the link to
          // the dev's own terminal is safe. Production always sends email.
          if (config.TEST_AUTH_ENABLED === 'true' && config.APP_ENV !== 'production') {
            console.log(JSON.stringify({ event: 'dev_magic_link', email, url }));
            return;
          }
          if (config.EXTERNAL_INTEGRATIONS_ENABLED !== 'true') {
            console.warn(
              JSON.stringify({ event: 'email_skipped', reason: 'integrations_disabled' }),
            );
            return;
          }
          await sendMagicLinkEmail({
            apiKey: env.RESEND_API_KEY,
            from: env.RESEND_FROM_EMAIL,
            to: email,
            url,
          });
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

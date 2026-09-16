import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import { subscriptions, users } from '../../db/schema';
import { getEntitlement } from '../../domain/entitlements';
import { createAuth } from '../auth';
import { requireSession } from '../http';

export const accountRoutes = new Hono<{ Bindings: CloudflareBindings }>();
accountRoutes.delete('/', async (c) => {
  const auth = createAuth(c.env);
  const session = await requireSession(c, auth);
  if (!session)
    return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } }, 401);
  const updatedAt = new Date(session.session.updatedAt).getTime();
  if (Date.now() - updatedAt > 15 * 60 * 1000)
    return c.json(
      {
        error: {
          code: 'RECENT_AUTH_REQUIRED',
          message: 'Sign in again before deleting your account.',
        },
      },
      403,
    );
  const db = drizzle(c.env.DB);
  const subscription = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, session.user.id))
    .get();
  if (
    getEntitlement(
      subscription ? { status: subscription.status, endsAt: subscription.endsAt } : null,
      new Date(),
    ).canScan
  )
    return c.json(
      {
        error: {
          code: 'ACTIVE_SUBSCRIPTION',
          message:
            'Cancel the active subscription in the billing portal before deleting your account.',
        },
      },
      409,
    );
  await db.delete(users).where(eq(users.id, session.user.id));
  return c.json({ data: { deleted: true } });
});

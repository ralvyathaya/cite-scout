import { Hono } from 'hono';
import { z } from 'zod';
import { createAuth } from '../auth';
import { readJson, requireSession } from '../http';
import { deleteAccountData } from '../account-deletion';

export const accountRoutes = new Hono<{ Bindings: CloudflareBindings }>();
accountRoutes.delete('/', async (c) => {
  const auth = createAuth(c.env);
  const session = await requireSession(c, auth);
  if (!session)
    return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } }, 401);
  const signedInAt = new Date(session.session.createdAt).getTime();
  if (Date.now() - signedInAt > 15 * 60 * 1000)
    return c.json(
      {
        error: {
          code: 'RECENT_AUTH_REQUIRED',
          message: 'Sign in again before deleting your account.',
        },
      },
      403,
    );
  const confirmation = z
    .object({ confirmation: z.literal('DELETE'), forfeitRemainingAccess: z.literal(true) })
    .safeParse(await readJson(c.req.raw));
  if (!confirmation.success)
    return c.json(
      {
        error: {
          code: 'CONFIRMATION_REQUIRED',
          message: 'Confirm permanent data removal and forfeiture of remaining access.',
        },
      },
      422,
    );
  try {
    const deleted = await deleteAccountData(c.env, session.user.id);
    if (!deleted)
      return c.json(
        {
          error: {
            code: 'ACCOUNT_CHANGED',
            message: 'Your billing state changed. Review it and try again.',
          },
        },
        409,
      );
    return c.json({ data: { deleted: true } });
  } catch (error) {
    if (error instanceof Error && error.message === 'ACTIVE_SUBSCRIPTION')
      return c.json(
        {
          error: {
            code: 'ACTIVE_SUBSCRIPTION',
            message: 'Cancel renewal in the billing portal before deleting your account.',
          },
        },
        409,
      );
    return c.json(
      {
        error: {
          code: 'BILLING_VERIFICATION_FAILED',
          message: 'Could not verify cancellation. Your account was not deleted. Try again.',
        },
      },
      503,
    );
  }
});

import { Hono } from 'hono';
import { z } from 'zod';
import { createAuth } from '../auth';
import { readJson, requireSession } from '../http';
import { runScan } from '../scans';

const scanInput = z.object({
  projectId: z.uuid(),
  promptIds: z.array(z.uuid()).min(1).max(10),
});
export const scanRoutes = new Hono<{ Bindings: CloudflareBindings }>();

for (const [path, trigger] of [
  ['/trial', 'trial'],
  ['/today', 'manual'],
] as const) {
  scanRoutes.post(path, async (c) => {
    const session = await requireSession(c, createAuth(c.env));
    if (!session)
      return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } }, 401);
    const parsed = scanInput.safeParse(await readJson(c.req.raw));
    if (!parsed.success)
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Select valid prompts.' } }, 422);
    try {
      return c.json(
        {
          data: await runScan(c.env, {
            userId: session.user.id,
            projectId: parsed.data.projectId,
            promptIds: parsed.data.promptIds,
            trigger,
          }),
        },
        202,
      );
    } catch (error) {
      const code = error instanceof Error ? error.message : 'SCAN_FAILED';
      const messages: Record<string, string> = {
        LEGACY_STAGING_SCANS_DISABLED:
          'Use Monitor Prompts in the GEO workspace for bounded staging checks.',
        PROJECT_NOT_FOUND: 'Project not found.',
        INVALID_PROMPTS: 'Select unique, enabled prompts from your project.',
        TRIAL_INVALID: 'The free trial supports up to three prompts on an unpaid account.',
        TRIAL_ALREADY_USED: 'Your free trial has already been consumed.',
        MANUAL_SCAN_ALREADY_USED: 'Your manual scan has already been used today.',
        PAID_ACCESS_REQUIRED: 'An active subscription is required to scan.',
      };
      return c.json(
        {
          error: {
            code: messages[code] ? code : 'SCAN_FAILED',
            message:
              messages[code] ??
              'The scan could not be started. Refresh to check its status before retrying.',
          },
        },
        code.includes('ALREADY') ? 409 : messages[code] ? 403 : 503,
      );
    }
  });
}

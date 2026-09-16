import { Hono } from 'hono';
import { z } from 'zod';
import { createAuth } from '../auth';
import { readJsonLimited, requireSession } from '../http';
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
    const parsed = scanInput.safeParse(await readJsonLimited(c.req.raw));
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
      return c.json(
        { error: { code, message: 'The scan could not be started.' } },
        code.includes('ALREADY') ? 409 : 403,
      );
    }
  });
}

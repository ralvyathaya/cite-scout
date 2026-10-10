import { Hono } from 'hono';
import { ZodError } from 'zod';
import {
  geoAllowance,
  readGeoSettings,
  saveGeoSettings,
  readGeoPromptSets,
  saveGeoPromptSet,
  deleteGeoPromptSet,
  startGeoRun,
  readGeoRun,
  readGeoObservations,
  readGeoObservation,
} from './geo-store';
import { geoPromptSetSchema, geoRunRequestSchema, geoSettingsSchema } from '../../shared/geo';
import { readJson } from '../http';

export const geoRoutes = new Hono<{
  Bindings: CloudflareBindings;
  Variables: { userId: string };
}>();
const errors: Record<string, string> = {
  PROJECT_NOT_FOUND: 'Finish project setup before configuring monitoring.',
  PROMPT_SET_NOT_FOUND: 'This prompt set is unavailable.',
  GEO_RUN_NOT_FOUND: 'This monitoring run is unavailable.',
  GEO_OBSERVATION_NOT_FOUND: 'This observation is unavailable.',
  GEO_SCANS_DISABLED: 'New GEO checks are paused. Saved evidence remains available.',
  GEO_BUDGET_REQUIRED: 'The operator must configure a positive GEO budget before checks can start.',
  GEO_CONFIGURATION_REQUIRED: 'Save your engines, location and language before monitoring.',
  GEO_DAILY_DISABLED: 'Daily checks are disabled for this project.',
  PAID_ACCESS_REQUIRED: 'A paid subscription is required for GEO checks.',
  PAID_STARTS_NEXT_UTC_DAY:
    'Paid monitoring starts on the next UTC day; your frozen trial follow-up remains available.',
  INVALID_PROMPT_SELECTION: 'Select one to ten active prompts from this project.',
  ENGINE_NOT_SELECTED: 'Choose engines enabled in monitoring settings.',
  GEO_QUOTA_EXCEEDED: 'This check exceeds the available budget. Review Usage or wait for reset.',
  GEO_COOLDOWN_OR_IN_FLIGHT:
    'A check is already running or a selected prompt and engine is within the five minute cooldown.',
  IDEMPOTENCY_CONFLICT:
    'This request id was already used for a different selection. Start a new request.',
  CONFIGURATION_CHANGED:
    'The configuration changed while starting this check. Reload and try again.',
  INVALID_CURSOR: 'This observations page is unavailable. Return to the first page.',
  VALIDATION_ERROR: 'Check the selected prompts, engines and monitoring configuration.',
};

// Mounted beneath the authenticated V2 router; standalone mounting must provide the same userId.
geoRoutes.use('*', async (c, next) => {
  if (!c.get('userId'))
    return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } }, 401);
  await next();
});
geoRoutes.onError((error, c) => {
  if (error instanceof ZodError)
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Check the selected prompts, engines and monitoring configuration.',
        },
      },
      422,
    );
  const code = error instanceof Error ? error.message : '';
  if (!errors[code]) throw error;
  return c.json(
    { error: { code, message: errors[code] } },
    code.endsWith('NOT_FOUND')
      ? 404
      : code === 'PAID_ACCESS_REQUIRED'
        ? 403
        : code === 'INVALID_CURSOR' || code === 'VALIDATION_ERROR'
          ? 422
          : code === 'GEO_QUOTA_EXCEEDED' || code === 'GEO_COOLDOWN_OR_IN_FLIGHT'
            ? 429
            : 409,
  );
});

geoRoutes.get('/settings', async (c) =>
  c.json({ data: await readGeoSettings(c.env, c.get('userId')) }),
);
geoRoutes.put('/settings', async (c) =>
  c.json({
    data: await saveGeoSettings(
      c.env,
      c.get('userId'),
      geoSettingsSchema.parse(await readJson(c.req.raw)),
    ),
  }),
);
geoRoutes.get('/allowance', async (c) =>
  c.json({ data: await geoAllowance(c.env, c.get('userId')) }),
);
geoRoutes.get('/prompt-sets', async (c) =>
  c.json({ data: await readGeoPromptSets(c.env, c.get('userId')) }),
);
geoRoutes.post('/prompt-sets', async (c) =>
  c.json(
    {
      data: await saveGeoPromptSet(
        c.env,
        c.get('userId'),
        geoPromptSetSchema.parse(await readJson(c.req.raw)),
      ),
    },
    201,
  ),
);
geoRoutes.delete('/prompt-sets/:id', async (c) => {
  await deleteGeoPromptSet(c.env, c.get('userId'), c.req.param('id'));
  return c.json({ data: { deleted: true } });
});
geoRoutes.post('/runs', async (c) =>
  c.json(
    {
      data: await startGeoRun(
        c.env,
        c.get('userId'),
        geoRunRequestSchema.parse(await readJson(c.req.raw)),
      ),
    },
    202,
  ),
);
geoRoutes.get('/runs/:id', async (c) =>
  c.json({ data: await readGeoRun(c.env, c.get('userId'), c.req.param('id')) }),
);
geoRoutes.get('/observations', async (c) =>
  c.json({ data: await readGeoObservations(c.env, c.get('userId'), c.req.query('cursor')) }),
);
geoRoutes.get('/observations/:id', async (c) =>
  c.json({ data: await readGeoObservation(c.env, c.get('userId'), c.req.param('id')) }),
);
geoRoutes.get('/observations/:id/raw', async (c) => {
  const observation = await readGeoObservation(c.env, c.get('userId'), c.req.param('id'));
  c.header(
    'Content-Disposition',
    `attachment; filename="geo-observation-${observation.id.replace(/[^a-zA-Z0-9_-]/g, '')}.json"`,
  );
  c.header('Cache-Control', 'private, no-store');
  return c.json({
    observationId: observation.id,
    capturedAt: observation.capturedAt,
    context: observation.context,
    provenance:
      'Parsed provider JSON retained with the immutable capture; not a byte-for-byte HTTP archive.',
    raw: observation.capture.raw,
  });
});

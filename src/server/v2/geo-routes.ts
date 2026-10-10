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
import { processGeoCollectors } from './collectors';

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
  let status: 404 | 403 | 422 | 429 | 409 = 409;
  if (code.endsWith('NOT_FOUND')) status = 404;
  else if (code === 'PAID_ACCESS_REQUIRED') status = 403;
  else if (code === 'INVALID_CURSOR' || code === 'VALIDATION_ERROR') status = 422;
  else if (code === 'GEO_QUOTA_EXCEEDED' || code === 'GEO_COOLDOWN_OR_IN_FLIGHT') status = 429;
  return c.json({ error: { code, message: errors[code] } }, status);
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
geoRoutes.post('/runs', async (c) => {
  const data = await startGeoRun(
    c.env,
    c.get('userId'),
    geoRunRequestSchema.parse(await readJson(c.req.raw)),
  );
  c.executionCtx.waitUntil(
    processGeoCollectors(c.env, 1).catch(() => {
      console.error(JSON.stringify({ event: 'geo_collector_deferred' }));
    }),
  );
  return c.json({ data }, 202);
});
geoRoutes.get('/runs/:id', async (c) =>
  c.json({ data: await readGeoRun(c.env, c.get('userId'), c.req.param('id')) }),
);
geoRoutes.get('/runs/:id/attempts', async (c) => {
  const run = await readGeoRun(c.env, c.get('userId'), c.req.param('id'));
  const rows = await c.env.DB.prepare(
    `SELECT v.item_id AS itemId,v.provider,v.status,v.failure_code AS failureCode,
    v.provider_request_id AS providerTaskId,v.reported_cost AS reportedCost,v.provider_response_json AS raw
    FROM provider_call_reservations v JOIN projects p ON p.id=v.project_id
    WHERE v.scan_run_id=? AND p.user_id=? ORDER BY v.reserved_at,v.id`,
  )
    .bind(run.id, c.get('userId'))
    .all<{ raw: string | null }>();
  c.header('Cache-Control', 'private, no-store');
  return c.json({
    data: rows.results.map((row) => ({
      ...row,
      raw: row.raw === null ? null : (JSON.parse(row.raw) as unknown),
    })),
  });
});
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

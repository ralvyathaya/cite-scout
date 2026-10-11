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
  readGeoRunHistory,
  readGeoObservations,
  readGeoObservation,
} from './geo-store';
import { geoPromptSetSchema, geoRunRequestSchema, geoSettingsSchema } from '../../shared/geo';
import { readJson } from '../http';
import { processGeoCollectors } from './collectors';
import {
  processGeoAnalysis,
  queueGeoAnalysis,
  queueGeoPageCheck,
  readGeoAnalyses,
  readGeoPageChecks,
} from './analysis';
import { z } from 'zod';
import { consumeRateLimit } from '../rate-limit';
import { patchGeoAction, readGeoAction, readGeoActions, readGeoSources } from './actions';
import { geoActionPatchSchema } from '../../shared/geo-actions';
import { geoEngineSchema } from '../../shared/geo';
import {
  completeGeoAction,
  reopenGeoAction,
  readGeoMeasurements,
  readGeoTrends,
} from './measurement';
import { geoCompletionSchema, geoReopenSchema } from '../../shared/geo-measurement';
import { geoCapabilities, geoUsage } from './geo-readiness';
const evidenceFilterSchema = z.object({
  days: z.coerce.number().int().min(1).max(30).default(30),
  engine: geoEngineSchema.optional(),
  promptId: z.string().min(1).max(100).optional(),
});

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
  GEO_PROCESSING_DISABLED:
    'Analysis or page verification is paused. Original answers remain available.',
  GEO_PROCESSING_BUDGET_REQUIRED:
    'Configure a positive processing budget before analysis or page verification.',
  GEO_PROCESSING_QUOTA_EXCEEDED:
    'Processing budget reached. Stored evidence is still available; retry after reset.',
  UNKNOWN_PAGE_TARGET: 'Choose an observed owned source or the configured brand homepage.',
  GEO_ACTION_NOT_FOUND: 'This action is unavailable.',
  GEO_ACTION_CHANGED: 'This action changed. Reload its current progress and try again.',
  GEO_ACTION_REOPEN_REQUIRED: 'Reopen this completed task to record another cycle of work.',
  INVALID_IMPLEMENTATION_TIME: 'Implementation time cannot be in the future.',
  INVALID_CHECKLIST: 'Choose checklist steps from this action.',
  INVALID_EVIDENCE_PERIOD: 'Choose a period from one to thirty days.',
  GEO_SCOPE_TOO_LARGE:
    'This scope contains too much evidence. Choose a shorter period or a single engine/prompt.',
};

// Mounted beneath the authenticated V2 router; standalone mounting must provide the same userId.
geoRoutes.use('*', async (c, next) => {
  if (!c.get('userId'))
    return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } }, 401);
  if (
    !(await consumeRateLimit(
      c.env.DB,
      `geo:${c.get('userId')}:${c.req.method === 'GET' ? 'read' : 'write'}`,
      c.req.method === 'GET' ? 120 : 30,
      60,
    ))
  )
    return c.json(
      { error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again in a minute.' } },
      429,
    );
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
geoRoutes.get('/capabilities', (c) => c.json({ data: geoCapabilities(c.env) }));
geoRoutes.get('/usage', async (c) => c.json({ data: await geoUsage(c.env, c.get('userId')) }));
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
  const input = geoRunRequestSchema.parse(await readJson(c.req.raw));
  const existing = await c.env.DB.prepare(
    'SELECT g.run_id FROM geo_run_snapshots g JOIN projects p ON p.id=g.project_id WHERE p.user_id=? AND g.request_id=?',
  )
    .bind(c.get('userId'), input.requestId)
    .first();
  if (!existing) {
    const settings = await readGeoSettings(c.env, c.get('userId'));
    const capabilities = geoCapabilities(c.env);
    if (
      (input.engines ?? settings.engines).some((engine) => !capabilities.engines[engine].available)
    )
      return c.json(
        {
          error: {
            code: 'GEO_PROVIDER_UNAVAILABLE',
            message:
              'One or more selected collectors are unavailable. Review monitoring settings; saved evidence remains readable.',
          },
        },
        409,
      );
  }
  const data = await startGeoRun(c.env, c.get('userId'), input);
  c.executionCtx.waitUntil(
    processGeoCollectors(c.env, 1).catch(() => {
      console.error(JSON.stringify({ event: 'geo_collector_deferred' }));
    }),
  );
  return c.json({ data }, 202);
});
geoRoutes.get('/runs', async (c) => {
  c.header('Cache-Control', 'private, no-store');
  return c.json({ data: await readGeoRunHistory(c.env, c.get('userId')) });
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
  c.json({
    data: await readGeoObservations(
      c.env,
      c.get('userId'),
      c.req.query('cursor'),
      evidenceFilterSchema.partial().parse(c.req.query()),
    ),
  }),
);
geoRoutes.get('/observations/:id', async (c) =>
  c.json({ data: await readGeoObservation(c.env, c.get('userId'), c.req.param('id')) }),
);
geoRoutes.get('/analyses', async (c) =>
  c.json({ data: await readGeoAnalyses(c.env, c.get('userId')) }),
);
geoRoutes.get('/actions', async (c) =>
  c.json({ data: await readGeoActions(c.env, c.get('userId')) }),
);
geoRoutes.get('/actions/:id', async (c) =>
  c.json({
    data: await readGeoAction(c.env, c.get('userId'), c.req.param('id'), c.req.query('cursor')),
  }),
);
geoRoutes.patch('/actions/:id', async (c) =>
  c.json({
    data: await patchGeoAction(
      c.env,
      c.get('userId'),
      c.req.param('id'),
      geoActionPatchSchema.parse(await readJson(c.req.raw)),
    ),
  }),
);
geoRoutes.get('/sources', async (c) => {
  const filter = evidenceFilterSchema.parse(c.req.query());
  return c.json({ data: await readGeoSources(c.env, c.get('userId'), filter) });
});
geoRoutes.get('/trends', async (c) => {
  const filter = evidenceFilterSchema.parse(c.req.query());
  return c.json({ data: await readGeoTrends(c.env, c.get('userId'), filter) });
});
geoRoutes.post('/actions/:id/complete', async (c) =>
  c.json({
    data: await completeGeoAction(
      c.env,
      c.get('userId'),
      c.req.param('id'),
      geoCompletionSchema.parse(await readJson(c.req.raw)),
    ),
  }),
);
geoRoutes.post('/actions/:id/reopen', async (c) =>
  c.json({
    data: await reopenGeoAction(
      c.env,
      c.get('userId'),
      c.req.param('id'),
      geoReopenSchema.parse(await readJson(c.req.raw)),
    ),
  }),
);
geoRoutes.get('/actions/:id/measurements', async (c) =>
  c.json({ data: await readGeoMeasurements(c.env, c.get('userId'), c.req.param('id')) }),
);
geoRoutes.get('/observations/:id/analyses', async (c) =>
  c.json({ data: await readGeoAnalyses(c.env, c.get('userId'), c.req.param('id')) }),
);
geoRoutes.post('/observations/:id/analyses', async (c) => {
  const input = z.object({ requestId: z.uuid() }).parse(await readJson(c.req.raw));
  const data = await queueGeoAnalysis(c.env, c.get('userId'), c.req.param('id'), input.requestId);
  c.executionCtx.waitUntil(
    processGeoAnalysis(c.env, 1).catch(() => {
      console.error(JSON.stringify({ event: 'geo_analysis_deferred' }));
    }),
  );
  return c.json({ data }, 202);
});
geoRoutes.get('/observations/:id/page-checks', async (c) =>
  c.json({ data: await readGeoPageChecks(c.env, c.get('userId'), c.req.param('id')) }),
);
geoRoutes.post('/observations/:id/page-checks', async (c) => {
  const input = z
    .object({ requestId: z.uuid(), target: z.url().max(2000) })
    .parse(await readJson(c.req.raw));
  const data = await queueGeoPageCheck(
    c.env,
    c.get('userId'),
    c.req.param('id'),
    input.target,
    input.requestId,
  );
  c.executionCtx.waitUntil(
    processGeoAnalysis(c.env, 1).catch(() => {
      console.error(JSON.stringify({ event: 'geo_page_check_deferred' }));
    }),
  );
  return c.json({ data }, 202);
});
geoRoutes.get('/observations/:id/raw', async (c) => {
  const observation = await readGeoObservation(c.env, c.get('userId'), c.req.param('id'));
  const requestedAt = await c.env.DB.prepare(
    'SELECT created_at FROM scan_runs WHERE id=? AND project_id=?',
  )
    .bind(observation.runId, observation.projectId)
    .first<number>('created_at');
  c.header(
    'Content-Disposition',
    `attachment; filename="geo-observation-${observation.id.replace(/[^a-zA-Z0-9_-]/g, '')}.json"`,
  );
  c.header('Cache-Control', 'private, no-store');
  return c.json({
    observationId: observation.id,
    capturedAt: observation.capturedAt,
    requestedAt: requestedAt === null ? null : new Date(requestedAt).toISOString(),
    context: observation.context,
    provenance:
      'Parsed provider JSON retained with the immutable capture; not a byte-for-byte HTTP archive.',
    raw: observation.capture.raw,
  });
});

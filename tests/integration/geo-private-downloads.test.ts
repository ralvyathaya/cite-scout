import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { v2Routes } from '../../src/server/v2/routes';
import { cookie, seed, withBindings } from './fixtures';
import { seedGeoEvidence } from './geo-fixtures';

describe('private GEO evidence downloads', () => {
  it.each(['raw', 'attempts'] as const)(
    'returns %s only to its owner, with private no-store caching',
    async (download) => {
      const env = withBindings({
        GEO_SCANS_ENABLED: 'true',
        EXTERNAL_INTEGRATIONS_ENABLED: 'true',
        V2_SCANS_ENABLED: 'true',
        GEO_GLOBAL_DAILY_CALL_CAP: '150',
        GEO_PROJECT_DAILY_CALL_CAP: '40',
        GEO_PROJECT_MONTHLY_CALL_CAP: '100',
      });
      const app = new Hono<{ Bindings: CloudflareBindings }>().route('/api/v2', v2Routes);
      const at = new Date();
      const owner = await seed(1, true, at);
      const foreign = await seed(1, true, at);
      const { observation, run } = await seedGeoEvidence(env, owner, 'google_aio', at);
      const item = run.items[0];
      if (!item) throw new Error('Expected synthetic run item');
      const rawAttempt = { fixture: true, taskId: 'synthetic-task', result: 'Owner-only result' };
      await env.DB.prepare(
        'UPDATE provider_call_reservations SET provider_request_id=?,provider_response_json=? WHERE id=?',
      )
        .bind('synthetic-task', JSON.stringify(rawAttempt), item.reservationId)
        .run();
      const path =
        download === 'raw'
          ? `/api/v2/geo/observations/${observation.id}/raw`
          : `/api/v2/geo/runs/${run.id}/attempts`;
      const allowed = await app.request(
        path,
        { headers: { Cookie: await cookie(owner.userId) } },
        env,
      );
      expect(allowed.status).toBe(200);
      expect(allowed.headers.get('Cache-Control')).toBe('private, no-store');
      if (download === 'raw') {
        expect(allowed.headers.get('Content-Disposition')).toBe(
          `attachment; filename="geo-observation-${observation.id}.json"`,
        );
        expect(await allowed.json()).toEqual({
          observationId: observation.id,
          capturedAt: observation.capturedAt,
          requestedAt: at.toISOString(),
          context: observation.context,
          provenance:
            'Parsed provider JSON retained with the immutable capture; not a byte-for-byte HTTP archive.',
          raw: observation.capture.raw,
        });
      } else {
        expect(await allowed.json()).toEqual({
          data: [
            {
              itemId: item.id,
              provider: 'google_aio',
              status: 'succeeded',
              failureCode: null,
              providerTaskId: 'synthetic-task',
              reportedCost: '0',
              raw: rawAttempt,
            },
          ],
        });
      }
      const denied = await app.request(
        path,
        { headers: { Cookie: await cookie(foreign.userId) } },
        env,
      );
      expect(denied.status).toBe(404);
      expect(await denied.json()).toMatchObject({
        error: { code: download === 'raw' ? 'GEO_OBSERVATION_NOT_FOUND' : 'GEO_RUN_NOT_FOUND' },
      });
      const anonymous = await app.request(path, {}, env);
      expect(anonymous.status).toBe(401);
      expect(await anonymous.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
    },
  );
});

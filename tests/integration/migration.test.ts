import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { providerCallReservations, users } from '../../src/db/schema';
import { runScan } from '../../src/server/scans';
import { db, provider, seed } from './fixtures';

it('copies existing usage intact and preserves accounting when migrated owners are deleted', async () => {
  const original = env.TEST_MIGRATIONS.find((migration) => migration.name.startsWith('0000'));
  const migration = env.TEST_MIGRATIONS.find((item) => item.name.startsWith('0001'));
  const table = original?.queries.find((query) =>
    query.includes('CREATE TABLE `provider_call_reservations`'),
  );
  if (!table || !migration) throw new Error('Missing accounting migration');
  const indexes =
    original?.queries.filter((query) => query.includes('ON `provider_call_reservations`')) ?? [];
  await env.DB.batch([
    env.DB.prepare('DROP TABLE provider_call_reservations'),
    env.DB.prepare(table),
    ...indexes.map((query) => env.DB.prepare(query)),
  ]);
  const item = await seed(1);
  await runScan(env, { ...item, trigger: 'trial', provider });
  const before = await db.select().from(providerCallReservations);
  expect(before).toHaveLength(1);
  await env.DB.batch(migration.queries.map((query) => env.DB.prepare(query)));
  expect(await db.select().from(providerCallReservations)).toEqual(before);
  await db.delete(users).where(eq(users.id, item.userId));
  const retained = await db.select().from(providerCallReservations);
  expect(retained[0]).toMatchObject({
    id: before[0]?.id,
    idempotencyKey: before[0]?.idempotencyKey,
    userId: null,
    projectId: null,
    promptId: null,
    scanRunId: null,
    status: 'succeeded',
  });
  expect((await env.DB.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
  expect(
    (await env.DB.prepare('PRAGMA index_list(provider_call_reservations)').all()).results,
  ).toHaveLength(6);
});

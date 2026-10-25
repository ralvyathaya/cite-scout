import { afterEach, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startGeoReview } from '../../scripts/review-geo';

let review: Awaited<ReturnType<typeof startGeoReview>> | undefined;
let directory = '';
afterEach(async () => {
  if (review)
    await new Promise<void>((resolve, reject) =>
      review?.server.close((error) => {
        if (error) reject(error);
        else resolve();
      }),
    );
  if (directory) {
    for (const file of await readdir(directory)) await unlink(join(directory, file));
    await rmdir(directory);
  }
});

it('keeps blind review private, validates human saves, retains drafts and refuses frozen changes', async () => {
  directory = await mkdtemp(join(tmpdir(), 'citescout-review-'));
  const rows = ['first', 'second'].map((id) => ({
    id,
    answerText: 'Synthetic evidence',
    options: { brandPresence: ['present', 'absent'], 'evidence.support': ['yes', 'no', 'unknown'] },
  }));
  const labels = {
    reviewedBy: '',
    reviewedAt: null,
    records: rows.map((row) => ({
      id: row.id,
      values: { brandPresence: null, 'evidence.support': null },
    })),
  };
  const original = JSON.stringify(labels);
  await writeFile(join(directory, 'packet.json'), JSON.stringify({ review: rows }));
  await writeFile(join(directory, 'human-labels.json'), original);
  review = await startGeoReview(directory);
  const { origin, token } = review;
  const headers = { 'X-Review-Token': token, Origin: origin, 'Content-Type': 'application/json' };
  const state = async () => {
    const response = await fetch(`${origin}/state`, { headers });
    return (await response.json()) as { version: string; labels: typeof labels; review: unknown[] };
  };
  const save = (body: unknown, extra = {}) =>
    fetch(`${origin}/save`, {
      method: 'POST',
      headers: { ...headers, ...extra },
      body: JSON.stringify(body),
    });
  expect((await fetch(`${origin}/state`)).status).toBe(403);
  const first = await state();
  expect(first.labels).toEqual(labels);
  expect(first.review).toEqual(
    rows.map((row) => ({ ...row, options: { brandPresence: ['present', 'absent'] } })),
  );
  const input = {
    version: first.version,
    reviewedBy: 'Human é',
    recordId: 'first',
    values: { brandPresence: 'present' },
    complete: false,
  };
  expect((await save(input, { Origin: 'https://untrusted.example' })).status).toBe(403);
  expect((await fetch(`${origin}/save`, { method: 'POST', headers, body: '{' })).status).toBe(422);
  expect((await save({ ...input, values: { brandPresence: 'invented' } })).status).toBe(422);
  expect(
    (await save({ ...input, values: { brandPresence: 'present', extra: 'present' } })).status,
  ).toBe(422);
  expect(
    (await save({ ...input, values: { brandPresence: 'present', 'evidence.support': 'yes' } }))
      .status,
  ).toBe(422);
  expect((await save({ ...input, complete: true })).status).toBe(422);
  expect(await readFile(join(directory, 'human-labels.json'), 'utf8')).toBe(original);
  expect((await save(input)).status).toBe(200);
  const draft = await state();
  expect(draft.labels.reviewedBy).toBe('Human é');
  expect(draft.labels.reviewedAt).toBeNull();
  expect(draft.labels.records[1]?.values.brandPresence).toBeNull();
  expect(draft.labels.records[0]?.values['evidence.support']).toBeNull();
  expect(await readFile(join(directory, 'human-labels.json.backup'), 'utf8')).toBe(original);
  expect((await save(input)).status).toBe(409);
  expect(
    (await save({ ...input, version: draft.version, recordId: 'second', complete: true })).status,
  ).toBe(200);
  const finished = await state();
  expect(finished.labels.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  await writeFile(join(directory, 'labels-lock.json'), '{}');
  expect((await save({ ...input, version: finished.version })).status).toBe(409);
  expect((await state()).labels).toEqual(finished.labels);
});

import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startGeoReview } from '../../scripts/review-geo';
import { createContext, Script } from 'node:vm';
import { createSourceFile, isFunctionDeclaration, ScriptTarget } from 'typescript';

let review: Awaited<ReturnType<typeof startGeoReview>> | undefined;
let directory = '';

it.each(['synthetic-spot-check', 'synthetic-unsampled'])(
  'retains an unsaved source correction (%s) and prevents bulk requests before that correction is saved',
  async (groupId) => {
    const html = await readFile(
      new URL('../../scripts/geo-review-ui.html', import.meta.url),
      'utf8',
    );
    const script = /<script nonce="__NONCE__">([\s\S]*?)<\/script>/u.exec(html)?.[1];
    if (!script) throw Error('Review script missing');
    const syntax = createSourceFile('review.js', script, ScriptTarget.Latest);
    const action = syntax.statements.find(
      (node) => isFunctionDeclaration(node) && node.name?.text === 'saveSource',
    );
    if (!action) throw Error('Source action missing');
    const status = { textContent: '' },
      originalState = { locked: false, version: 'synthetic', sourceReview: { decisions: {} } };
    let writes = 0;
    const sandbox = {
      busy: false,
      dirty: false,
      sourceDirty: true,
      state: originalState,
      sourceGroupId: groupId,
      el: (id: string) =>
        id === 'status'
          ? status
          : { value: id === 'reviewer' ? 'Synthetic browser test' : 'owned' },
      document: { querySelectorAll: () => [] },
      confirm: () => true,
      render: vi.fn(),
      sourceGroups: () => [],
      request: (path: string) => {
        if (path === '/sources') writes++;
        return Promise.resolve(originalState);
      },
    };
    const execution: unknown = new Script(
      `${action.getText(syntax)}\nsaveSource('accept_remaining')`,
    ).runInContext(createContext(sandbox));
    await Promise.resolve(execution);
    expect(writes).toBe(0);
    expect(sandbox.sourceDirty).toBe(true);
    expect(status.textContent).toMatch(/Simpan.*kelompok/iu);
  },
);
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
    sources: [],
    checks: [],
    context: { brand: { id: 'brand', name: 'Brand', domain: 'brand.example' }, competitors: [] },
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
  await writeFile(
    join(directory, 'packet.json'),
    JSON.stringify({
      review: rows,
      manifest: { records: rows.map((row) => ({ id: row.id, split: 'held_out' })) },
    }),
  );
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

import { expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, unlink, rmdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startGeoReview } from '../../scripts/review-geo';
import {
  createSourceReview,
  resolveSourceReview,
  reviewSourceGroup,
  sourceReviewGroups,
  type SourcePacket,
} from '../../scripts/geo-source-review';

function required<T>(value: T | undefined): T {
  if (value === undefined) throw Error('Missing synthetic fixture');
  return value;
}

function sourcePacket(): SourcePacket {
  return {
    manifest: {
      records: [
        { id: 'a', split: 'calibration' },
        { id: 'b', split: 'held_out' },
      ],
    },
    review: ['a', 'b'].map((id) => ({
      id,
      context: {
        brand: { id: 'brand', name: 'Brand', domain: 'brand.example' },
        competitors: [{ id: 'rival', name: 'Rival', domain: 'rival.example' }],
      },
      checks: [],
      sources: [
        'https://help.rival.example/a',
        'https://help.rival.example/b',
        'https://rival.example.evil.test/',
      ].map((url, i) => ({
        id: `s${String(i)}`,
        url,
        canonicalUrl: url,
        title: null,
        referenceLevel: 'retrieved' as const,
      })),
      options: Object.fromEntries(
        [0, 1, 2].flatMap((i) => [
          [`source.s${String(i)}.role`, ['owned', 'competitor_owned', 'third_party', 'unknown']],
          [
            `source.s${String(i)}.type`,
            ['editorial', 'review_directory', 'community', 'official_product', 'other', 'unknown'],
          ],
        ]),
      ),
    })),
  };
}

it('groups only equal evidence and context within a partition, keeps held-out proposals blind and rejects spoofed domains', () => {
  const packet = sourcePacket();
  const groups = sourceReviewGroups(packet);
  expect(groups).toHaveLength(6);
  expect(groups.filter((g) => g.split === 'held_out').every((g) => g.proposal === null)).toBe(true);
  const rival = groups.find((g) => g.split === 'calibration' && g.label === 'help.rival.example');
  expect(rival?.refs).toHaveLength(2);
  expect(rival?.proposal).toBe('competitor_owned');
  expect(
    groups.find((g) => g.split === 'calibration' && g.label === 'rival.example.evil.test')
      ?.proposal,
  ).toBe('third_party');
  const missingContent = groups.find((g) => g.kind === 'type' && g.split === 'calibration');
  expect(missingContent?.refs).toHaveLength(3);
  expect(missingContent?.proposal).toBe('unknown');
  expect(
    groups.filter((g) => g.kind === 'role' && g.split === 'calibration').every((g) => g.spotCheck),
  ).toBe(true);
});

it('saves source decisions separately through the authenticated local API, rejects stale/forged saves and enforces frozen review', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'citescout-sources-'));
  const packet = sourcePacket();
  const labels = {
    reviewedBy: 'Synthetic human',
    reviewedAt: null,
    records: packet.review.map((row) => ({
      id: row.id,
      values: Object.fromEntries(Object.keys(row.options).map((field) => [field, null])),
    })),
  };
  const original = JSON.stringify(labels);
  await writeFile(join(directory, 'packet.json'), JSON.stringify(packet));
  await writeFile(join(directory, 'human-labels.json'), original);
  const server = await startGeoReview(directory);
  try {
    const headers = {
      'X-Review-Token': server.token,
      Origin: server.origin,
      'Content-Type': 'application/json',
    };
    const state = async () =>
      (await (await fetch(`${server.origin}/state`, { headers })).json()) as { version: string };
    const first = await state(),
      group = required(sourceReviewGroups(packet).at(0));
    const body = {
      action: 'save',
      version: first.version,
      reviewedBy: 'Synthetic human',
      groupId: group.id,
      value: group.proposal,
    };
    const save = (payload: unknown, extra = {}) =>
      fetch(`${server.origin}/sources`, {
        method: 'POST',
        headers: { ...headers, ...extra },
        body: JSON.stringify(payload),
      });
    expect((await save(body, { Origin: 'https://wrong.example' })).status).toBe(403);
    expect((await save({ ...body, value: 'fabricated' })).status).toBe(422);
    expect((await save({ ...body, mode: 'independent' })).status).toBe(422);
    expect((await save(body)).status).toBe(200);
    expect(await readFile(join(directory, 'human-labels.json'), 'utf8')).toBe(original);
    expect((await save(body)).status).toBe(409);
    expect(await readFile(join(directory, 'source-review.json'), 'utf8')).toContain('assisted');
    await writeFile(join(directory, 'labels-lock.json'), '{}');
    expect((await save({ ...body, version: (await state()).version })).status).toBe(409);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.server.close((error) => {
        if (error) reject(error);
        else resolve();
      }),
    );
    for (const file of await readdir(directory)) await unlink(join(directory, file));
    await rmdir(directory);
  }
});

it('requires spot-checks before batch acceptance and never overwrites human values or promotes assisted labels to independent gold', () => {
  const packet = sourcePacket();
  let review = createSourceReview(packet);
  const groups = sourceReviewGroups(packet);
  expect(() =>
    reviewSourceGroup(packet, review, { action: 'accept_remaining', reviewedBy: 'Human' }),
  ).toThrow(/spot-check/i);
  for (const group of groups) {
    review = reviewSourceGroup(packet, review, {
      action: 'save',
      reviewedBy: 'Human',
      groupId: group.id,
      value: group.proposal ?? (group.kind === 'type' ? 'unknown' : 'third_party'),
    });
  }
  const human = {
    reviewedBy: 'Human',
    reviewedAt: null,
    records: packet.review.map((row) => ({
      id: row.id,
      values: Object.fromEntries(
        Object.keys(row.options).map((field) => [field, null as string | null]),
      ),
    })),
  };
  const original = JSON.stringify(human);
  const resolved = resolveSourceReview(packet, human, review);
  expect(resolved.remaining).toBe(0);
  expect(resolved.assisted.size).toBe(6);
  expect(resolved.independentGroups).toBe(3);
  expect(JSON.stringify(human)).toBe(original);
  required(human.records.at(0)).values['source.s0.role'] = 'owned';
  const preserved = resolveSourceReview(packet, human, review);
  expect(required(preserved.labels.records.at(0)).values['source.s0.role']).toBe('owned');
  expect(required(preserved.labels.records.at(0)).values['source.s1.role']).toBe(
    'competitor_owned',
  );
  expect(preserved.preservedHumanDifferences).toBe(1);
  expect(() => resolveSourceReview(packet, human, { ...review, packetHash: 'changed' })).toThrow(
    /changed/i,
  );
  const held = required(groups.find((g) => g.split === 'held_out'));
  required(review.decisions[held.id]).mode = 'assisted';
  expect(() => resolveSourceReview(packet, { ...human, records: [] }, review)).toThrow(
    /provenance/i,
  );
});

it('requires explicit unknown for grouped content types without checked content instead of creating category gold', () => {
  const packet = sourcePacket();
  const group = required(
    sourceReviewGroups(packet).find((g) => g.split === 'held_out' && g.kind === 'type'),
  );
  expect(group.options).toEqual(['unknown']);
  expect(() =>
    reviewSourceGroup(packet, createSourceReview(packet), {
      action: 'save',
      reviewedBy: 'Synthetic human',
      groupId: group.id,
      value: 'editorial',
    }),
  ).toThrow(/choice/i);
  const review = reviewSourceGroup(packet, createSourceReview(packet), {
    action: 'save',
    reviewedBy: 'Synthetic human',
    groupId: group.id,
    value: 'unknown',
  });
  expect(review.decisions[group.id]?.mode).toBe('independent');
  const human = {
    records: packet.review.map((row) => ({
      id: row.id,
      values: Object.fromEntries(
        Object.keys(row.options).map((field) => [field, null as string | null]),
      ),
    })),
  };
  const held = required(human.records.find((row) => row.id === 'b'));
  held.values['source.s0.type'] = 'editorial';
  held.values['source.s1.type'] = 'community';
  const resolved = resolveSourceReview(packet, human, review);
  const preserved = required(resolved.labels.records.find((row) => row.id === 'b'));
  expect([
    preserved.values['source.s0.type'],
    preserved.values['source.s1.type'],
    preserved.values['source.s2.type'],
  ]).toEqual(['editorial', 'community', 'unknown']);
  expect(resolved.preservedHumanDifferences).toBe(2);
  expect(held.values['source.s2.type']).toBeNull();
});

it('keeps changed ownership contexts and different checked excerpts in separate groups', () => {
  const packet = sourcePacket(),
    original = required(packet.review.at(0));
  const clone = structuredClone(original);
  clone.id = 'other-context';
  clone.context.brand.domain = 'help.rival.example';
  clone.context.competitors = [];
  packet.review.push(clone);
  packet.manifest.records.push({ id: clone.id, split: 'calibration' });
  expect(
    sourceReviewGroups(packet).filter(
      (g) => g.split === 'calibration' && g.kind === 'role' && g.label === 'help.rival.example',
    ),
  ).toHaveLength(2);
  const contentPacket = sourcePacket(),
    a = required(contentPacket.review.at(0)),
    b = structuredClone(a);
  b.id = 'other-content';
  contentPacket.review.push(b);
  contentPacket.manifest.records.push({ id: b.id, split: 'calibration' });
  const source = required(a.sources.at(0));
  for (const [row, excerpt] of [
    [a, 'Synthetic editorial excerpt'],
    [b, 'Synthetic product excerpt'],
  ] as const)
    row.checks = [
      {
        id: row.id,
        target: source.url,
        finalUrl: source.url,
        status: 'checked',
        httpStatus: 200,
        noindex: false,
        canonical: source.url,
        robots: null,
        excerpt,
        checkedAt: '2026-10-28T00:00:00Z',
        reason: null,
      },
    ];
  const groups = sourceReviewGroups(contentPacket).filter(
    (g) => g.split === 'calibration' && g.kind === 'type' && g.label === source.url,
  );
  expect(groups).toHaveLength(2);
  const group = required(groups.find((g) => g.refs.some((ref) => ref.recordId === a.id)));
  const review = reviewSourceGroup(contentPacket, createSourceReview(contentPacket), {
    action: 'save',
    reviewedBy: 'Synthetic human',
    groupId: group.id,
    value: 'editorial',
  });
  const human = {
    records: contentPacket.review.map((row) => ({
      id: row.id,
      values: Object.fromEntries(
        Object.keys(row.options).map((field) => [field, null as string | null]),
      ),
    })),
  };
  const resolved = resolveSourceReview(contentPacket, human, review);
  expect(
    required(resolved.labels.records.find((r) => r.id === a.id)).values['source.s0.type'],
  ).toBe('editorial');
  expect(
    required(resolved.labels.records.find((r) => r.id === b.id)).values['source.s0.type'],
  ).toBeNull();
});

it('blocks bulk acceptance after a disagreement and does not merge different content or ownership contexts', () => {
  const packet = sourcePacket();
  const group = required(
    sourceReviewGroups(packet).find((g) => g.split === 'calibration' && g.kind === 'role'),
  );
  const review = reviewSourceGroup(packet, createSourceReview(packet), {
    action: 'save',
    reviewedBy: 'Human',
    groupId: group.id,
    value: group.proposal === 'owned' ? 'third_party' : 'owned',
  });
  expect(() =>
    reviewSourceGroup(packet, review, { action: 'accept_remaining', reviewedBy: 'Human' }),
  ).toThrow(/spot-check/i);
  required(required(packet.review.at(0)).sources.at(0)).url = 'javascript:alert(1)';
  expect(
    sourceReviewGroups(packet).some(
      (g) => g.split === 'calibration' && g.proposal === 'unknown' && g.kind === 'role',
    ),
  ).toBe(true);
});

it('bulk approval is limited to unsampled calibration roles and correcting a sample revokes that bulk approval', () => {
  const packet = sourcePacket(),
    row = required(packet.review.at(0));
  const original = required(row.sources.at(0));
  row.sources = Array.from({ length: 15 }, (_, index) => ({
    ...original,
    id: `extra${String(index)}`,
    url: `https://s${String(index)}.example/page`,
    canonicalUrl: `https://s${String(index)}.example/page`,
  }));
  row.options = Object.fromEntries(
    row.sources.flatMap((source) => [
      ['source.' + source.id + '.role', ['owned', 'competitor_owned', 'third_party', 'unknown']],
      [
        'source.' + source.id + '.type',
        ['editorial', 'review_directory', 'community', 'official_product', 'other', 'unknown'],
      ],
    ]),
  );
  const groups = sourceReviewGroups(packet);
  let review = createSourceReview(packet);
  for (const group of groups.filter((g) => g.spotCheck))
    review = reviewSourceGroup(packet, review, {
      action: 'save',
      reviewedBy: 'Synthetic human',
      groupId: group.id,
      value: 'third_party',
    });
  review = reviewSourceGroup(packet, review, {
    action: 'accept_remaining',
    reviewedBy: 'Synthetic human',
  });
  expect(Object.values(review.decisions).filter((d) => d?.acceptance === 'batch')).toHaveLength(5);
  expect(groups.filter((g) => g.split === 'held_out').every((g) => !review.decisions[g.id])).toBe(
    true,
  );
  expect(groups.filter((g) => g.kind === 'type').every((g) => !review.decisions[g.id])).toBe(true);
  const sample = required(groups.find((g) => g.spotCheck));
  review = reviewSourceGroup(packet, review, {
    action: 'save',
    reviewedBy: 'Synthetic human',
    groupId: sample.id,
    value: 'owned',
  });
  expect(Object.values(review.decisions).some((d) => d?.acceptance === 'batch')).toBe(false);
  expect(() =>
    reviewSourceGroup(packet, review, {
      action: 'accept_remaining',
      reviewedBy: 'Synthetic human',
    }),
  ).toThrow(/spot-check/i);
});

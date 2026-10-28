import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { prepareEvaluation } from './evaluate-geo';

type Packet = ReturnType<typeof prepareEvaluation>;
export interface SourcePacket {
  manifest: { records: { id: string; split: 'calibration' | 'held_out' }[] };
  review: (Pick<Packet['review'][number], 'id' | 'sources' | 'checks'> & {
    context: Pick<Packet['review'][number]['context'], 'brand' | 'competitors'>;
    options: Partial<Record<string, readonly string[]>>;
  })[];
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const key = (record: string, field: string) => JSON.stringify([record, field]);
const decisionSchema = z
  .object({
    value: z.string(),
    reviewedBy: z.string().trim().min(1).max(100),
    reviewedAt: z.iso.datetime(),
    mode: z.enum(['assisted', 'independent']),
    acceptance: z.enum(['individual', 'batch']),
  })
  .strict();
const reviewSchema = z
  .object({
    protocol: z.literal('geo-source-review-1'),
    packetHash: z.string(),
    groupsHash: z.string(),
    decisions: z.record(z.string(), decisionSchema),
  })
  .strict();
export type SourceReview = Omit<z.infer<typeof reviewSchema>, 'decisions'> & {
  decisions: Partial<Record<string, z.infer<typeof decisionSchema>>>;
};
export interface SourceGroup {
  id: string;
  split: 'calibration' | 'held_out';
  kind: 'role' | 'type';
  label: string;
  context: string;
  options: string[];
  proposal: string | null;
  reason: string;
  evidence: unknown[];
  refs: { recordId: string; field: string; url: string }[];
  spotCheck: boolean;
}
function host(value: string) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.hostname.toLowerCase()
      : null;
  } catch {
    return null;
  }
}
const within = (hostname: string, domain: string | null) => {
  const normalized = domain?.toLowerCase().replace(/^www\./u, '');
  return !!normalized && (hostname === normalized || hostname.endsWith(`.${normalized}`));
};
export function sourceReviewGroups(packet: SourcePacket): SourceGroup[] {
  const groups = new Map<string, SourceGroup>();
  for (const row of packet.review) {
    const split = packet.manifest.records.find((item) => item.id === row.id)?.split;
    if (!split) throw Error('Source partition missing');
    const context = JSON.stringify({
      brand: row.context.brand,
      competitors: row.context.competitors,
    });
    for (const source of row.sources) {
      const hostname = host(source.url),
        canonicalHost = host(source.canonicalUrl);
      const safeHost = hostname && hostname === canonicalHost ? hostname : null;
      const owned = safeHost && within(safeHost, row.context.brand.domain);
      const competitor =
        safeHost && row.context.competitors.some((item) => within(safeHost, item.domain));
      const role =
        !safeHost || (owned && competitor)
          ? 'unknown'
          : owned
            ? 'owned'
            : competitor
              ? 'competitor_owned'
              : 'third_party';
      const checked = row.checks.filter(
        (check) =>
          check.status === 'checked' &&
          !!check.excerpt?.trim() &&
          [source.url, source.canonicalUrl].some(
            (url) => url === check.target || url === check.finalUrl,
          ),
      );
      for (const kind of ['role', 'type'] as const) {
        const field = `source.${source.id}.${kind}`,
          suppliedOptions = row.options[field];
        if (!suppliedOptions) throw Error('Source field missing');
        const options =
          kind === 'type' && !checked.length
            ? suppliedOptions.filter((value) => value === 'unknown')
            : suppliedOptions;
        if (!options.length) throw Error('Missing-content source groups require an unknown option');
        const identity =
          kind === 'role'
            ? (safeHost ?? [row.id, source.id])
            : checked.length
              ? [source.canonicalUrl, checked]
              : 'no-checked-content';
        const id = hash({ split, kind, context, identity, options });
        let group = groups.get(id);
        if (!group) {
          group = {
            id,
            split,
            kind,
            context,
            options: [...options],
            label:
              kind === 'role'
                ? (safeHost ?? 'URL perlu diperiksa')
                : checked.length
                  ? source.canonicalUrl
                  : 'Isi halaman belum tersedia',
            proposal:
              split === 'held_out'
                ? null
                : kind === 'role'
                  ? role
                  : checked.length
                    ? null
                    : 'unknown',
            reason:
              kind === 'role'
                ? 'Kepemilikan relatif terhadap domain brand/kompetitor pada konteks asli; bukan bukti afiliasi hukum.'
                : checked.length
                  ? 'Nilai dari isi halaman tersimpan berikut.'
                  : 'Packet tidak memuat isi halaman yang diperiksa. URL/judul saja tidak membuktikan jenis konten.',
            evidence: kind === 'type' ? checked : [],
            refs: [],
            spotCheck: false,
          };
          groups.set(id, group);
        }
        group.refs.push({ recordId: row.id, field, url: source.url });
      }
    }
  }
  const result = [...groups.values()];
  const candidates = result
    .filter((g) => g.split === 'calibration' && g.kind === 'role')
    .map((group) => ({ group, order: hash(['spot-check-1', packet.manifest, group.id]) }))
    .sort((a, b) => a.order.localeCompare(b.order))
    .map(({ group }) => group);
  const selected = new Set(candidates.slice(0, 10));
  for (const value of new Set(candidates.map((g) => g.proposal))) {
    const representative = candidates.find((g) => g.proposal === value);
    if (representative) selected.add(representative);
  }
  for (const group of candidates)
    if (selected.has(group) || group.proposal === 'unknown') group.spotCheck = true;
  return result.sort(
    (a, b) =>
      Number(b.spotCheck) - Number(a.spotCheck) ||
      a.label.localeCompare(b.label) ||
      a.id.localeCompare(b.id),
  );
}
export function createSourceReview(packet: SourcePacket): SourceReview {
  return {
    protocol: 'geo-source-review-1',
    packetHash: hash(packet),
    groupsHash: hash(sourceReviewGroups(packet)),
    decisions: {},
  };
}
function validate(packet: SourcePacket, review: SourceReview) {
  reviewSchema.parse(review);
  const groups = sourceReviewGroups(packet);
  if (review.packetHash !== hash(packet) || review.groupsHash !== hash(groups))
    throw Error('Source packet or protocol changed');
  for (const [id, decision] of Object.entries(review.decisions)) {
    const group = groups.find((g) => g.id === id);
    if (
      !decision ||
      !group ||
      !group.options.includes(decision.value) ||
      decision.mode !== (group.split === 'held_out' ? 'independent' : 'assisted') ||
      (decision.acceptance === 'batch' &&
        (group.split !== 'calibration' ||
          group.kind !== 'role' ||
          group.spotCheck ||
          group.proposal === 'unknown' ||
          decision.value !== group.proposal))
    )
      throw Error('Invalid source review provenance');
  }
  const batched = Object.values(review.decisions).some((d) => d?.acceptance === 'batch');
  if (
    batched &&
    groups.some(
      (g) =>
        g.spotCheck &&
        (!review.decisions[g.id] ||
          review.decisions[g.id]?.value !== g.proposal ||
          review.decisions[g.id]?.acceptance !== 'individual'),
    )
  )
    throw Error('Source spot-check must be resolved before batch acceptance');
  return groups;
}
export function reviewSourceGroup(
  packet: SourcePacket,
  review: SourceReview,
  input:
    | { action: 'save'; reviewedBy: string; groupId: string; value: string }
    | { action: 'accept_remaining'; reviewedBy: string },
) {
  const groups = validate(packet, review),
    next = structuredClone(review);
  let selected: SourceGroup[];
  if (input.action === 'save') {
    selected = groups.filter((g) => g.id === input.groupId);
    if (selected.length !== 1 || !selected[0]?.options.includes(input.value))
      throw Error('Invalid source group or choice');
    if (selected[0].spotCheck && input.value !== selected[0].proposal)
      next.decisions = Object.fromEntries(
        Object.entries(next.decisions).filter(([, decision]) => decision?.acceptance !== 'batch'),
      );
  } else {
    if (
      groups.some(
        (g) =>
          g.spotCheck && (!review.decisions[g.id] || review.decisions[g.id]?.value !== g.proposal),
      )
    )
      throw Error('Complete matching spot-checks first; disagreements require individual review');
    selected = groups.filter(
      (g) =>
        g.split === 'calibration' &&
        g.kind === 'role' &&
        !g.spotCheck &&
        g.proposal &&
        g.proposal !== 'unknown' &&
        !review.decisions[g.id],
    );
  }
  for (const group of selected)
    next.decisions[group.id] = decisionSchema.parse({
      value: input.action === 'save' ? input.value : group.proposal,
      reviewedBy: input.reviewedBy,
      reviewedAt: new Date().toISOString(),
      mode: group.split === 'held_out' ? 'independent' : 'assisted',
      acceptance: input.action === 'save' ? 'individual' : 'batch',
    });
  validate(packet, next);
  return next;
}
export function resolveSourceReview<
  T extends { records: { id: string; values: Record<string, string | null> }[] },
>(packet: SourcePacket, human: T, review?: SourceReview) {
  const groups = review ? validate(packet, review) : sourceReviewGroups(packet);
  const labels = structuredClone(human),
    assisted = new Set<string>();
  let independentGroups = 0,
    assistedGroups = 0,
    preservedHumanDifferences = 0;
  for (const group of groups) {
    const decision = review?.decisions[group.id];
    if (!decision) continue;
    if (decision.mode === 'independent') independentGroups++;
    else assistedGroups++;
    for (const ref of group.refs) {
      const row = labels.records.find((r) => r.id === ref.recordId);
      if (!row || !Object.hasOwn(row.values, ref.field)) throw Error('Source label field missing');
      if (row.values[ref.field] !== null && row.values[ref.field] !== decision.value)
        preservedHumanDifferences++;
      if (row.values[ref.field] === null) {
        row.values[ref.field] = decision.value;
        if (decision.mode === 'assisted') assisted.add(key(ref.recordId, ref.field));
      }
    }
  }
  const remaining = groups.reduce(
    (n, group) =>
      n +
      group.refs.filter(
        (ref) => labels.records.find((r) => r.id === ref.recordId)?.values[ref.field] == null,
      ).length,
    0,
  );
  const coverage = (selected: SourceGroup[]) => {
    const types = selected.filter((group) => group.kind === 'type');
    const sourceOccurrences = types.reduce((n, group) => n + group.refs.length, 0);
    const withCheckedContent = types
      .filter((group) => group.evidence.length > 0)
      .reduce((n, group) => n + group.refs.length, 0);
    return {
      sourceOccurrences,
      withCheckedContent,
      withoutCheckedContent: sourceOccurrences - withCheckedContent,
    };
  };
  const contentCoverage = {
    overall: coverage(groups),
    byPartition: {
      calibration: coverage(groups.filter((g) => g.split === 'calibration')),
      held_out: coverage(groups.filter((g) => g.split === 'held_out')),
    },
  };
  return {
    labels,
    assisted,
    remaining,
    independentGroups,
    assistedGroups,
    preservedHumanDifferences,
    contentCoverage,
  };
}
export const isAssistedSourceField = (assisted: Set<string>, recordId: string, field: string) =>
  assisted.has(key(recordId, field));
export async function readSourceReview(directory: string): Promise<SourceReview | undefined> {
  try {
    return reviewSchema.parse(
      JSON.parse(await readFile(resolve(directory, 'source-review.json'), 'utf8')) as unknown,
    );
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

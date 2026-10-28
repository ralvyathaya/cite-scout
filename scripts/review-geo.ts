import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import type { prepareEvaluation } from './evaluate-geo';
import { isEvaluationReviewField } from './evaluate-geo';
import {
  createSourceReview,
  readSourceReview,
  resolveSourceReview,
  reviewSourceGroup,
  sourceReviewGroups,
} from './geo-source-review';

type Packet = ReturnType<typeof prepareEvaluation>;
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const saveSchema = z
  .object({
    version: z.string().regex(/^[a-f0-9]{64}$/),
    reviewedBy: z.string().trim().min(1).max(100),
    recordId: z.string().min(1).max(200),
    values: z.record(z.string(), z.string().nullable()),
    complete: z.boolean(),
  })
  .strict();
const sourceSaveSchema = z.discriminatedUnion('action', [
  z
    .object({
      version: z.string(),
      reviewedBy: z.string().trim().min(1).max(100),
      action: z.literal('save'),
      groupId: z.string(),
      value: z.string(),
    })
    .strict(),
  z
    .object({
      version: z.string(),
      reviewedBy: z.string().trim().min(1).max(100),
      action: z.literal('accept_remaining'),
    })
    .strict(),
]);

export async function startGeoReview(directory: string) {
  // shortcut: one local reviewer process; stop it before freezing or editing label files elsewhere.
  const packet = JSON.parse(await readFile(resolve(directory, 'packet.json'), 'utf8')) as Packet;
  const labelsPath = resolve(directory, 'human-labels.json');
  const sourcePath = resolve(directory, 'source-review.json');
  const groups = sourceReviewGroups(packet);
  const current = async () => {
    const text = await readFile(labelsPath, 'utf8');
    const labels = JSON.parse(text) as Packet['labels'];
    const review = await readSourceReview(directory);
    const resolved = resolveSourceReview(packet, labels, review);
    return {
      labels,
      review,
      resolved,
      version: digest(text + JSON.stringify(review ?? null)),
    };
  };
  const writeAtomic = async (path: string, next: unknown) => {
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
      if (await locked()) throw Error('Review is locked; no labels were changed.');
      await rename(temporary, path);
    } finally {
      await unlink(temporary).catch((error: unknown) => {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      });
    }
  };
  const locked = async () =>
    stat(resolve(directory, 'labels-lock.json')).then(
      () => true,
      (error: unknown) => {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
        throw error;
      },
    );
  const token = randomBytes(32).toString('hex');
  const nonce = randomBytes(24).toString('hex');
  const template = await readFile(new URL('./geo-review-ui.html', import.meta.url), 'utf8');
  let origin = '',
    writing = false;
  const server = createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
    );
    const run = async () => {
      if (req.headers.host !== new URL(origin).host) {
        send(403, { error: 'Invalid local host.' });
        return;
      }
      if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(template.replaceAll('__NONCE__', nonce));
        return;
      }
      if (req.headers['x-review-token'] !== token) {
        send(403, { error: 'Open the original local review link.' });
        return;
      }
      if (req.method === 'GET' && req.url === '/state') {
        const state = await current();
        send(200, {
          review: packet.review.map((row) => ({
            ...row,
            options: Object.fromEntries(
              Object.entries(row.options).filter(([field]) => isEvaluationReviewField(field)),
            ),
          })),
          ignoredLabelCount: packet.review.reduce(
            (count, row) =>
              count +
              Object.keys(row.options).filter((field) => !isEvaluationReviewField(field)).length,
            0,
          ),
          labels: state.labels,
          version: state.version,
          sourceReview: {
            groups,
            decisions: state.review?.decisions ?? {},
            remaining: state.resolved.remaining,
            assistedFields: state.resolved.assisted.size,
            contentCoverage: state.resolved.contentCoverage,
            preservedHumanDifferences: state.resolved.preservedHumanDifferences,
          },
          locked: await locked(),
        });
        return;
      }
      if (req.method !== 'POST' || !['/save', '/sources'].includes(req.url ?? '')) {
        send(404, { error: 'Not found.' });
        return;
      }
      if (req.headers.origin !== origin || req.headers['content-type'] !== 'application/json') {
        send(403, { error: 'Save from this review page.' });
        return;
      }
      if (writing) {
        send(409, { error: 'Another save is in progress. Reload.' });
        return;
      }
      writing = true;
      try {
        if (await locked()) {
          send(409, { error: 'Review is locked. Reload.' });
          return;
        }
        let body = '';
        req.setEncoding('utf8');
        for await (const chunk of req) {
          body += String(chunk);
          if (Buffer.byteLength(body) > 131072) {
            send(413, { error: 'Save is too large.' });
            return;
          }
        }
        let json: unknown;
        try {
          json = JSON.parse(body) as unknown;
        } catch {
          send(422, { error: 'Invalid JSON.' });
          return;
        }
        if (req.url === '/sources') {
          const parsedSource = sourceSaveSchema.safeParse(json);
          if (!parsedSource.success) {
            send(422, { error: 'Enter your name and a valid source decision.' });
            return;
          }
          const state = await current();
          if (state.version !== parsedSource.data.version) {
            send(409, { error: 'Labels changed elsewhere. Reload before saving.' });
            return;
          }
          if (state.labels.reviewedAt) {
            send(409, { error: 'Review already confirmed complete.' });
            return;
          }
          try {
            const next = reviewSourceGroup(
              packet,
              state.review ?? createSourceReview(packet),
              parsedSource.data,
            );
            resolveSourceReview(packet, state.labels, next);
            await writeAtomic(sourcePath, next);
          } catch (error) {
            send(422, {
              error: error instanceof Error ? error.message : 'Source decision rejected.',
            });
            return;
          }
          send(200, { saved: true });
          return;
        }
        const parsed = saveSchema.safeParse(json);
        if (!parsed.success) {
          send(422, { error: 'Enter your reviewer name and valid field selections.' });
          return;
        }
        const input = parsed.data;
        const state = await current();
        if (state.version !== input.version) {
          send(409, { error: 'Labels changed elsewhere. Reload before saving.' });
          return;
        }
        const labels = state.labels;
        const record = packet.review.find((row) => row.id === input.recordId);
        const target = labels.records.find((row) => row.id === input.recordId);
        const activeOptions = Object.entries(record?.options ?? {}).filter(([field]) =>
          isEvaluationReviewField(field),
        );
        if (
          !record ||
          !target ||
          Object.keys(input.values).sort().join('\n') !==
            activeOptions
              .map(([field]) => field)
              .sort()
              .join('\n') ||
          activeOptions.some(
            ([field, choices]) =>
              input.values[field] !== null &&
              !choices.some((choice) => choice === input.values[field]),
          )
        ) {
          send(422, { error: 'Only the supplied choices for this answer are allowed.' });
          return;
        }
        if (
          activeOptions.some(
            ([field]) =>
              field.startsWith('source.') && input.values[field] !== target.values[field],
          )
        ) {
          send(422, {
            error: 'Use the grouped source review; existing human source choices are preserved.',
          });
          return;
        }
        target.values = { ...target.values, ...input.values };
        labels.reviewedBy = input.reviewedBy;
        labels.reviewedAt = null;
        if (input.complete) {
          const effective = resolveSourceReview(packet, labels, state.review).labels;
          if (
            labels.records.length !== packet.review.length ||
            packet.review.some((row) => {
              const values = effective.records.find((label) => label.id === row.id)?.values;
              return (
                !values ||
                Object.entries(row.options)
                  .filter(([field]) => isEvaluationReviewField(field))
                  .some(([field, choices]) => !choices.some((choice) => choice === values[field]))
              );
            })
          ) {
            send(422, {
              error: 'Complete every field in all answers before confirming the review.',
            });
            return;
          }
          labels.reviewedAt = new Date().toISOString();
        }
        try {
          await copyFile(labelsPath, `${labelsPath}.backup`, constants.COPYFILE_EXCL);
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
        }
        await writeAtomic(labelsPath, labels);
        send(200, { labels, version: (await current()).version });
        return;
      } finally {
        writing = false;
      }
    };
    void run().catch(() => {
      if (!res.headersSent)
        send(500, {
          error: 'Local save failed. Your existing labels were retained; reload before retrying.',
        });
      else res.end();
    });
  });
  await new Promise<void>((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Local review could not start.');
  origin = `http://127.0.0.1:${String(address.port)}`;
  return { server, origin, token, url: `${origin}/#${token}` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const directory = resolve('research/private/owner-evaluation-review');
  void startGeoReview(directory)
    .then(({ url }) => {
      console.log(`Local blind review: ${url}`);
    })
    .catch(() => {
      console.error('Could not open the existing private review packet. No labels were changed.');
      process.exitCode = 1;
    });
}

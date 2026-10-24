import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import type { prepareEvaluation } from './evaluate-geo';

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

export async function startGeoReview(directory: string) {
  // shortcut: one local reviewer process; stop it before freezing or editing label files elsewhere.
  const packet = JSON.parse(await readFile(resolve(directory, 'packet.json'), 'utf8')) as Packet;
  const labelsPath = resolve(directory, 'human-labels.json');
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
        const text = await readFile(labelsPath, 'utf8');
        send(200, {
          review: packet.review,
          labels: JSON.parse(text) as unknown,
          version: digest(text),
          locked: await locked(),
        });
        return;
      }
      if (req.method !== 'POST' || req.url !== '/save') {
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
        const parsed = saveSchema.safeParse(json);
        if (!parsed.success) {
          send(422, { error: 'Enter your reviewer name and valid field selections.' });
          return;
        }
        const input = parsed.data;
        const text = await readFile(labelsPath, 'utf8');
        if (digest(text) !== input.version) {
          send(409, { error: 'Labels changed elsewhere. Reload before saving.' });
          return;
        }
        const labels = JSON.parse(text) as Packet['labels'];
        const record = packet.review.find((row) => row.id === input.recordId);
        const target = labels.records.find((row) => row.id === input.recordId);
        if (
          !record ||
          !target ||
          Object.keys(input.values).sort().join('\n') !==
            Object.keys(record.options).sort().join('\n') ||
          Object.entries(record.options).some(
            ([field, choices]) =>
              input.values[field] !== null &&
              !choices.some((choice) => choice === input.values[field]),
          )
        ) {
          send(422, { error: 'Only the supplied choices for this answer are allowed.' });
          return;
        }
        target.values = input.values;
        labels.reviewedBy = input.reviewedBy;
        labels.reviewedAt = null;
        if (input.complete) {
          if (
            labels.records.length !== packet.review.length ||
            packet.review.some((row) => {
              const values = labels.records.find((label) => label.id === row.id)?.values;
              return (
                !values ||
                Object.entries(row.options).some(
                  ([field, choices]) => !choices.some((choice) => choice === values[field]),
                )
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
        const next = `${JSON.stringify(labels, null, 2)}\n`;
        const temporary = `${labelsPath}.${randomUUID()}.tmp`;
        try {
          await writeFile(temporary, next, { flag: 'wx', mode: 0o600 });
          if (await locked()) {
            send(409, { error: 'Review was locked. No labels were changed.' });
            return;
          }
          await rename(temporary, labelsPath);
        } finally {
          await unlink(temporary).catch((error: unknown) => {
            if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
              throw error;
          });
        }
        send(200, { labels, version: digest(next) });
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

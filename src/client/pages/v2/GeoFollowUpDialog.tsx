import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../components/ui/dialog';
import type { GeoActionDetail } from '../../../shared/geo-actions';
import { geoSurfaces } from '../../../shared/geo';
import { api } from './api';

export function GeoFollowUpDialog({ detail }: { detail: GeoActionDetail }) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [evidence, setEvidence] = useState(detail.evidence);
  const [selected, setSelected] = useState<string[]>([]);
  const [targetUrl, setTargetUrl] = useState(detail.action.targetUrl ?? '');
  const [changeDescription, setChangeDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<GeoActionDetail | null>(null);
  const attempt = useRef<{ body: string; requestId: string } | null>(null);
  const evidenceGeneration = useRef(0);
  useEffect(() => {
    const generation = evidenceGeneration;
    return () => {
      generation.current++;
    };
  }, []);
  const path = `/geo/actions/${encodeURIComponent(detail.action.id)}`;
  async function loadEvidence() {
    const generation = ++evidenceGeneration.current;
    setLoading(true);
    setReady(false);
    setError(null);
    try {
      const rows = [...detail.evidence];
      let cursor = detail.nextEvidenceCursor;
      while (cursor) {
        const next = await api<GeoActionDetail>(`${path}?cursor=${encodeURIComponent(cursor)}`);
        if (generation !== evidenceGeneration.current) return;
        rows.push(...next.evidence);
        cursor = next.nextEvidenceCursor;
      }
      setEvidence(rows);
      setReady(true);
    } catch (reason) {
      if (generation === evidenceGeneration.current)
        setError(reason instanceof Error ? reason.message : 'Could not load the baseline records.');
    } finally {
      if (generation === evidenceGeneration.current) setLoading(false);
    }
  }
  const included = evidence.filter((proof) => selected.includes(proof.analysisId));
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) evidenceGeneration.current++;
        if (value && !created) void loadEvidence();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">Plan follow-up work</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Plan follow-up work</DialogTitle>
          <DialogDescription>
            Choose the baseline for new work on your website. Your source action, notes and previous
            pins stay in its history. This does not run monitoring.
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <div className="space-y-3 text-sm" role="status">
            <p>Follow-up action saved with {created.evidence.length} selected baseline records.</p>
            <Link
              className="text-primary underline"
              to={`/app/playbook/${encodeURIComponent(created.action.id)}`}
              onClick={() => {
                setOpen(false);
              }}
            >
              Open follow-up action
            </Link>
          </div>
        ) : (
          <form
            className="min-w-0 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (busy || !ready || !included.length) return;
              const input = {
                revision: detail.action.revision,
                proofs: included.map(({ observationId, analysisId }) => ({
                  observationId,
                  analysisId,
                })),
                targetUrl,
                changeDescription,
              };
              const body = JSON.stringify(input);
              if (attempt.current?.body !== body)
                attempt.current = { body, requestId: crypto.randomUUID() };
              const requestId = attempt.current.requestId;
              setBusy(true);
              setError(null);
              void api<GeoActionDetail>(`${path}/follow-ups`, { requestId, ...input })
                .then(setCreated)
                .catch((reason: unknown) => {
                  setError(
                    reason instanceof Error
                      ? reason.message
                      : 'Could not save follow-up work. Your draft is retained.',
                  );
                })
                .finally(() => {
                  setBusy(false);
                });
            }}
          >
            <Link
              className="text-sm text-primary underline"
              to={`/app/playbook/${encodeURIComponent(detail.action.id)}`}
              onClick={() => {
                setOpen(false);
              }}
            >
              Review source action history
            </Link>
            {loading ? (
              <p role="status">Loading all baseline records…</p>
            ) : (
              <fieldset disabled={busy} className="max-h-72 min-w-0 space-y-3 overflow-y-auto pr-1">
                <legend className="mb-2 text-sm font-medium">Select baseline records</legend>
                <p className="text-xs text-muted-foreground">
                  Select at most one record per prompt and engine. Complete, usable analysis and the
                  current monitoring context are checked before saving.
                </p>
                {!evidence.length && (
                  <p className="text-sm">
                    No supporting records are available. Capture and review a baseline first.
                  </p>
                )}
                {evidence.map((proof) => (
                  <div key={proof.analysisId} className="min-w-0 rounded-lg border p-3 text-sm">
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 size-4 shrink-0 accent-primary"
                        checked={selected.includes(proof.analysisId)}
                        onChange={(event) => {
                          setSelected((previous) =>
                            event.target.checked
                              ? [...previous, proof.analysisId]
                              : previous.filter((id) => id !== proof.analysisId),
                          );
                        }}
                      />
                      <span className="min-w-0 break-words">
                        {proof.scope.context.promptText}
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {geoSurfaces[proof.scope.context.engine].label} ·{' '}
                          {new Date(proof.scope.capturedAt).toLocaleString()}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {proof.scope.context.collector} ·{' '}
                          {proof.scope.context.requestedModel ?? 'Model not requested'} ·{' '}
                          {proof.scope.context.languageCode} / {proof.scope.context.locationCode} /{' '}
                          {proof.scope.context.device}
                        </span>
                      </span>
                    </label>
                    <Link
                      className="ml-7 mt-2 inline-block text-xs text-primary underline"
                      to={`/app/observations/${encodeURIComponent(proof.observationId)}`}
                    >
                      Inspect original answer
                    </Link>
                    <details className="ml-7 mt-2 text-xs text-muted-foreground">
                      <summary className="cursor-pointer">Cohort details</summary>
                      <p className="mt-1 break-all">
                        Prompt version {proof.scope.context.promptVersionId} ·{' '}
                        {proof.scope.context.collectorVersion} · output limit{' '}
                        {proof.scope.context.maxOutputTokens}
                      </p>
                    </details>
                  </div>
                ))}
              </fieldset>
            )}
            <p className="text-sm" aria-live="polite">
              Included: {included.length} · Excluded: {evidence.length - included.length}. Excluded
              records will not be added to this follow-up.
            </p>
            <div className="space-y-2 text-sm">
              <label htmlFor={`${formId}-url`}>Owned page for new work</label>
              <Input
                id={`${formId}-url`}
                required
                type="url"
                maxLength={2000}
                value={targetUrl}
                disabled={busy}
                placeholder="https://your-website.com/comparison"
                onChange={(event) => {
                  setTargetUrl(event.target.value);
                }}
              />
            </div>
            <div className="space-y-2 text-sm">
              <label htmlFor={`${formId}-change`}>Planned change</label>
              <Textarea
                id={`${formId}-change`}
                required
                minLength={5}
                maxLength={2000}
                value={changeDescription}
                disabled={busy}
                onChange={(event) => {
                  setChangeDescription(event.target.value);
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              After creating this action, do the work in your own tools. Record the actual URL and
              implementation time when you complete it, then compare fresh observations.
            </p>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              disabled={
                busy || !ready || !included.length || !changeDescription.trim() || !targetUrl.trim()
              }
            >
              {busy ? 'Saving follow-up…' : 'Create follow-up action'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

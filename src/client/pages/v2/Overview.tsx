import { useState } from 'react';
import { ArrowRight, CheckCircle2, CircleAlert, FileSearch, RefreshCw } from 'lucide-react';
import { Link, Navigate, useOutletContext, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/button';
import { api, useResource } from './api';
import { RunProgress, type WorkspaceContext } from './Workspace';
import type { V2ObservationPayload, V2QuestionsPayload } from '../../../shared/v2';
import type { GeoSettings } from '../../../shared/geo';
import { GeoOverview } from './GeoWorkspace';

const box = 'rounded-xl border bg-card p-5 shadow-sm';
const time = (at: string | null) =>
  at
    ? new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : 'No saved check';

export function V2Overview() {
  const { data } = useOutletContext<WorkspaceContext>();
  const settings = useResource<GeoSettings>('/geo/settings');
  if (settings.loading) return <p role="status">Loading monitoring configuration…</p>;
  return settings.data?.configured === true || data.internalTestAccess ? (
    <GeoOverview />
  ) : (
    <>
      <p className="text-xs text-muted-foreground">
        Legacy Perplexity workspace · frozen trial and saved history.{' '}
        <Link className="text-primary underline" to="/app/settings">
          Configure GEO monitoring
        </Link>
      </p>
      {settings.error && (
        <p role="alert" className="text-sm text-destructive">
          {settings.error.message}
        </p>
      )}
      <LegacyOverview configurationAvailable={!settings.error} />
    </>
  );
}

function LegacyOverview({ configurationAvailable }: { configurationAvailable: boolean }) {
  const context = useOutletContext<WorkspaceContext>();
  const { data } = context;
  const rows = useResource<V2QuestionsPayload>(data.project ? '/questions' : null, true);
  const [selected, setSelected] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const questions = rows.data?.questions.filter((q) => q.enabled && !q.archivedAt) ?? [];
  const selectedRow =
    questions.find((q) => q.id === selected) ?? questions.find((q) => q.latest) ?? questions[0];
  const proof = useResource<V2ObservationPayload>(
    selectedRow?.latest ? `/observations/${selectedRow.latest.id}` : null,
  );
  if (!data.project) return <Navigate to="/app/onboarding" replace />;
  const summary = rows.data?.summary;
  let reason: string | null = null;
  if (!configurationAvailable)
    reason = 'Monitoring configuration is unavailable. Reload before starting a paid check.';
  else if (!data.scansEnabled) reason = 'Monitoring is paused. Saved answers remain available.';
  else if (!data.canScan && data.trial?.state !== 'eligible') {
    reason =
      data.trial?.state === 'waiting'
        ? 'Your trial follow-up is scheduled automatically.'
        : 'Monitoring access is inactive. Review your plan in Settings.';
  } else if (data.usage.today >= data.usage.dailyLimit) reason = 'Daily observation limit reached.';
  else if (data.usage.month >= data.usage.monthlyLimit)
    reason = 'Monthly observation limit reached.';
  else if (questions.length === 0) reason = 'Add an active prompt before monitoring.';
  const runId = params.get('run') ?? sessionStorage.getItem('citescout-run');
  const observation = proof.data?.observation;
  const excerpt =
    observation?.capture?.textParts[0]?.text ??
    observation?.capture?.text ??
    observation?.legacyText;
  const inspect = questions.filter((q) => q.needsAttention || q.delta?.changed);
  async function start() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api<{ runId: string }>('/scans', {
        mode: data.canScan ? 'today' : 'baseline',
      });
      sessionStorage.setItem('citescout-run', result.runId);
      setParams({ run: result.runId });
      setMessage(
        'Check requested. Current daily checks reuse an existing run for today when one is already available.',
      );
      await Promise.all([rows.reload(), context.reload()]);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Could not start monitoring.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            {data.project.brandName} · {data.project.canonicalDomain}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Visibility & action overview
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Track changes. Review original evidence. Decide what to improve next.
          </p>
        </div>
        <div className="max-w-sm space-y-2">
          <Button
            onClick={() => void start()}
            disabled={busy || rows.loading || Boolean(reason)}
            aria-describedby="monitor-status"
          >
            <RefreshCw className={`size-4 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
            {busy ? 'Requesting check…' : 'Monitor Prompts'}
          </Button>
          <p id="monitor-status" className="text-xs text-muted-foreground">
            {reason ??
              (data.canScan
                ? 'Perplexity · daily checks within your usage allowance.'
                : 'Start your frozen trial baseline.')}
          </p>
        </div>
      </div>
      {(!data.scansEnabled || questions.length === 0) && (
        <p className="text-xs text-muted-foreground">
          Explore a local demo:{' '}
          <a className="text-primary underline" href="/app/overview?fixture=1">
            Open fixture workspace — synthetic data, no provider calls
          </a>
        </p>
      )}
      {[error, rows.error].filter(Boolean).map((e, i) => (
        <p
          key={i}
          role="alert"
          className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
        >
          {e?.message}
        </p>
      ))}
      {message && (
        <p role="status" className="rounded-lg border bg-muted/30 p-3 text-sm">
          {message}
        </p>
      )}
      {runId && <RunProgress id={runId} />}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        <span>Latest saved check per active prompt · Perplexity Agent API</span>
        <span>Last capture: {time(summary?.to ?? null)}</span>
      </div>
      {rows.loading ? (
        <p role="status">Loading your observations…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [
              'Brand match',
              summary?.available
                ? `${String(Math.round((summary.brandMatched / summary.available) * 100))}%`
                : '—',
              `${String(summary?.brandMatched ?? 0)} of ${String(summary?.available ?? 0)} available answers`,
            ],
            [
              'Answer coverage',
              `${String(summary?.available ?? 0)} / ${String(summary?.tracked ?? 0)}`,
              'Active prompts with a saved answer',
            ],
            [
              'Comparable changes',
              `${String(summary?.changed ?? 0)} / ${String(summary?.comparable ?? 0)}`,
              'Changes among comparable prompt pairs',
            ],
            [
              'Observation allowance',
              `${String(data.usage.month)} / ${String(data.usage.monthlyLimit)}`,
              `This month · ${String(data.usage.today)} / ${String(data.usage.dailyLimit)} today`,
            ],
          ].map(([label, value, note]) => (
            <div key={label} className={box}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
              <p className="mt-2 text-xs text-muted-foreground">{note}</p>
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-[1.45fr_1fr]">
        <section className={`${box} space-y-4`}>
          <div className="flex flex-wrap justify-between gap-2">
            <h2 className="font-semibold">Changes worth investigating</h2>
            <Link to="/app/questions" className="text-xs font-medium text-primary">
              All prompts →
            </Link>
          </div>
          {inspect.length === 0 ? (
            <div className="flex gap-3 rounded-lg bg-muted/30 p-4">
              <CheckCircle2
                className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-medium">
                  {summary?.available
                    ? 'No flagged changes in the latest checks'
                    : 'Your baseline starts here'}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {summary?.available
                    ? 'Inspect saved answers below. Comparable changes need matching measurement context.'
                    : 'Monitor your prompts to capture answers and start building an evidence history.'}
                </p>
              </div>
            </div>
          ) : (
            inspect.slice(0, 4).map((q) => (
              <Link
                key={q.id}
                to={`/app/questions/${q.id}${q.latest ? `?observation=${q.latest.id}` : ''}`}
                className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/30"
              >
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium">{q.text}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {q.delta?.summary ??
                      q.latestAttempt?.failureCode ??
                      (q.stale
                        ? 'Saved answer is stale. Inspect its capture date.'
                        : 'Inspect this check before drawing a conclusion.')}
                  </p>
                </div>
              </Link>
            ))
          )}
          <p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">
            Method: literal brand matching in captured answers. Failed checks are excluded from the
            answer denominator. This summary uses latest saved evidence; historical cohort trends
            are being added.
          </p>
        </section>
        <section className={`${box} space-y-4`}>
          <h2 className="font-semibold">Monitoring & usage</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Current engine</span>
              <span>Perplexity Agent API</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Schedule</span>
              <span>
                {data.canScan ? 'Daily' : data.trial ? `Trial · ${data.trial.state}` : 'Inactive'}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Daily usage resets</span>
              <span>{time(data.usage.resetAt)}</span>
            </div>
          </div>
          <Link
            to="/app/settings"
            className="inline-flex items-center gap-2 text-xs font-medium text-primary"
          >
            Review project & plan <ArrowRight className="size-3" aria-hidden="true" />
          </Link>
        </section>
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[1fr_1.15fr]">
        <section className={`${box} space-y-4`}>
          <div className="flex justify-between gap-2">
            <h2 className="font-semibold">What to inspect next</h2>
            <span className="text-xs text-muted-foreground">{questions.length} active prompts</span>
          </div>
          {!questions.length && (
            <p className="text-sm text-muted-foreground">
              Add your buyer questions in Prompt Sets.
            </p>
          )}
          {questions.slice(0, 8).map((q) => (
            <div
              key={q.id}
              className={`rounded-lg border p-3 ${selectedRow?.id === q.id ? 'border-primary/30 bg-primary/5' : ''}`}
            >
              <button
                type="button"
                className="w-full text-left text-sm font-medium hover:text-primary"
                onClick={() => {
                  setSelected(q.id);
                }}
                aria-pressed={selectedRow?.id === q.id}
              >
                {q.text}
              </button>
              <p className="mt-2 text-xs text-muted-foreground">
                {q.latest
                  ? q.latest.brandMatched
                    ? 'Brand match found'
                    : 'No literal brand match in saved answer'
                  : 'No saved answer yet'}
              </p>
              {q.latest && (
                <Link
                  className="mt-2 inline-block text-xs font-medium text-primary"
                  to={`/app/questions/${q.id}?observation=${q.latest.id}`}
                >
                  {q.previousId ? 'Compare checks' : 'Inspect saved answer'}
                </Link>
              )}
            </div>
          ))}
          <p className="border-t pt-3 text-xs leading-relaxed text-muted-foreground">
            Diagnosis and actionable Owned / Earned Media briefs are being added. Saved answers
            remain available for inspection.
          </p>
        </section>
        <section className={`${box} space-y-4`} aria-label="Original observation evidence">
          <div className="flex items-center gap-2">
            <FileSearch className="size-4 text-primary" aria-hidden="true" />
            <h2 className="font-semibold">Original answer evidence</h2>
          </div>
          {proof.error && (
            <p role="alert" className="text-sm text-destructive">
              {proof.error.message}
            </p>
          )}
          {proof.loading ? (
            <p role="status">Loading original evidence…</p>
          ) : observation ? (
            <>
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Observed prompt
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">
                  {observation.context?.text ?? observation.questionText}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Perplexity Agent API · {time(observation.capturedAt)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {observation.capture
                    ? `Model: ${observation.capture.model} · Original saved response`
                    : 'Historical answer · original model metadata unavailable'}
                </p>
              </div>
              {excerpt ? (
                <blockquote className="whitespace-pre-wrap break-words border-l-2 border-primary/40 pl-4 text-sm leading-relaxed">
                  {excerpt.slice(0, 600)}
                  {excerpt.length > 600 && '…'}
                </blockquote>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No answer text is available in this saved observation.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Original excerpt, not a generated summary. Open the full answer to inspect returned
                sources and citation linkage.
              </p>
              <Button variant="outline" size="sm" asChild>
                <Link to={`/app/questions/${observation.questionId}?observation=${observation.id}`}>
                  View full answer & raw JSON <ArrowRight className="size-3" aria-hidden="true" />
                </Link>
              </Button>
            </>
          ) : (
            <div className="rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground">
              {selectedRow
                ? 'This prompt has no saved answer yet. Monitor prompts to capture original evidence.'
                : 'Select an active prompt after completing project setup.'}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

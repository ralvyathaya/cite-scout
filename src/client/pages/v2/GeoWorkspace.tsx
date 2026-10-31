import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Link,
  Navigate,
  useOutletContext,
  useParams,
  useSearchParams,
  useLocation,
} from 'react-router';
import {
  ArrowRight,
  FileSearch,
  RefreshCw,
  MapPin,
  Info,
  Search,
  SlidersHorizontal,
  Globe,
  Target,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '../../components/ui/button';
import { PricingPlans } from '../../components/PricingPlans';
import { billingSelection, subscriptionLabel } from '../../lib/billing-selection';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import {
  Tooltip as ControlTooltip,
  TooltipContent,
  TooltipTrigger,
} from '../../components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { ApiError, api, useResource } from './api';
import { fixtureMode } from './geo-fixture-mode';
import { WorkspaceHeading } from './WorkspaceHeading';
import { GeoFollowUpDialog } from './GeoFollowUpDialog';
import { actionCopy } from './action-copy';
import { AnswerMarkdown } from '../../components/AnswerMarkdown';
import { EngineIcon } from '../../components/EngineIcon';
import { AnswerSources, SafeSource, SourceIcon } from '../../components/SourceIdentity';
import { answerQuery, answerReturnTo } from '../../lib/answer-navigation';
import type { Billing, WorkspaceContext } from './Workspace';
import {
  geoSurfaces,
  type GeoAllowance,
  type GeoEngine,
  type GeoObservation,
  type GeoObservationPage,
  type GeoRun,
  type GeoRunHistory,
  type GeoSettings,
  type GeoSettingsInput,
} from '../../../shared/geo';
import type { DecisionModel, GeoAnalysis, GeoPageCheck } from '../../../shared/geo-analysis';
import type { GeoAction, GeoActionDetail, GeoActionPatch } from '../../../shared/geo-actions';
import type { GeoDailySample, GeoMetric, GeoPinMeasurement } from '../../../shared/geo-measurement';

const box = 'min-w-0 break-words rounded-xl border bg-card p-5 shadow-sm';
const small = 'text-xs leading-relaxed text-muted-foreground';
const engines = Object.keys(geoSurfaces) as GeoEngine[];
const time = (value: string | null) =>
  value
    ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : 'Not reported';
const words = (value: string) => value.replaceAll('_', ' ');
function CaptureBadge({ quality }: { quality: GeoObservation['capture']['quality'] }) {
  return (
    <Badge
      variant={quality === 'complete' ? 'success' : quality === 'partial' ? 'warning' : 'secondary'}
    >
      {quality === 'no_feature' ? 'No AI feature' : quality === 'complete' ? 'Complete' : 'Partial'}
    </Badge>
  );
}
function relativeTime(value: string) {
  const minutes = Math.round((Date.parse(value) - Date.now()) / 60_000);
  if (Math.abs(minutes) < 1) return 'Just now';
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  return Math.abs(hours) < 24
    ? formatter.format(hours, 'hour')
    : formatter.format(Math.round(hours / 24), 'day');
}
const allowanceReasons: Record<string, string> = {
  GEO_SCANS_DISABLED: 'New monitoring checks are paused. Saved answers remain readable.',
  PAID_ACCESS_REQUIRED:
    'A paid subscription is required for new monitoring checks. Review Billing & usage.',
  PAID_STARTS_NEXT_UTC_DAY:
    'Paid monitoring starts next UTC day. Your trial follow-up remains available.',
  GEO_BUDGET_REQUIRED:
    'New checks are temporarily unavailable. Contact support to enable monitoring.',
  GEO_QUOTA_EXCEEDED: 'Monitoring allowance reached. Review Usage or wait for the UTC reset.',
  GEO_COST_UNKNOWN: 'New checks are temporarily unavailable. Contact support before trying again.',
  GEO_PRODUCTION_COST_POLICY_REQUIRED:
    'New checks are temporarily unavailable. Contact support before trying again.',
  GEO_SPEND_CAP_EXCEEDED:
    'New checks are temporarily unavailable. Contact support before trying again.',
};
const supportReasons = new Set([
  'GEO_BUDGET_REQUIRED',
  'GEO_COST_UNKNOWN',
  'GEO_PRODUCTION_COST_POLICY_REQUIRED',
  'GEO_SPEND_CAP_EXCEEDED',
]);
const allowanceReason = (reason: string | null | undefined) =>
  reason
    ? (allowanceReasons[reason] ??
      'Monitoring is unavailable. Contact support for help. Your saved answers remain readable.')
    : 'New checks are unavailable. Saved evidence remains readable.';
export interface GeoCapabilities {
  engines: Partial<
    Record<
      GeoEngine,
      {
        enabled?: boolean;
        available: boolean;
        reason: string | null;
        collector?: string;
        requestedModel?: string | null;
        nextStep?: string | null;
      }
    >
  >;
  classifier: {
    available: boolean;
    model: DecisionModel;
    reason: string | null;
    needsReview: true;
  };
  pageChecks: { available: boolean; reason: string | null };
}
interface GeoTrends {
  version: string;
  asOf: string;
  samples: GeoDailySample[];
  captures: number;
  classifiedCaptures: number;
  method: string;
}
function ErrorNotice({ error }: { error: Error | null }) {
  const message = error instanceof ApiError ? allowanceReasons[error.code] : undefined;
  return error ? (
    <p
      role="alert"
      className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
    >
      {message ?? allowanceReasons[error.message] ?? error.message}
    </p>
  ) : null;
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-muted/25 p-4 text-sm text-muted-foreground">
      <FileSearch className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
function useMutation() {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  async function run(work: () => Promise<unknown>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (reason) {
      setError(reason instanceof Error ? reason : new Error('Request failed.'));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run };
}
function Choice({
  label,
  value,
  set,
  options,
}: {
  label: string;
  value: string;
  set: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="min-w-0 space-y-1">
      <span className={small}>{label}</span>
      <Select value={value} onValueChange={set}>
        <SelectTrigger aria-label={label} className="w-full min-w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="workspace-theme max-w-[calc(100vw-2rem)]">
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="max-w-xl whitespace-normal break-words"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
function useEvidenceFilter() {
  const [params, setParams] = useSearchParams();
  const engineValue = params.get('engine');
  const engine = engines.find((value) => value === engineValue);
  const requestedDays = params.get('days') ?? '7';
  const days = ['7', '14', '30'].includes(requestedDays) ? requestedDays : '7';
  const promptId = params.get('promptId') ?? '';
  const query = new URLSearchParams({ days });
  if (engine) query.set('engine', engine);
  if (promptId) query.set('promptId', promptId);
  function set(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value === 'all' || !value) next.delete(key);
    else next.set(key, value);
    next.delete('cursor');
    next.delete('observation');
    setParams(next);
  }
  return { engine, days, promptId, query: query.toString(), params, set, setParams };
}
function EvidenceFilters({ filter }: { filter: ReturnType<typeof useEvidenceFilter> }) {
  const { data } = useOutletContext<WorkspaceContext>();
  return (
    <div
      className="grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-3"
      aria-label="Evidence filters"
    >
      <Choice
        label="Period"
        value={filter.days}
        set={(value) => {
          filter.set('days', value);
        }}
        options={['7', '14', '30'].map((value) => ({ value, label: `Last ${value} days` }))}
      />
      <Choice
        label="Engine"
        value={filter.engine ?? 'all'}
        set={(value) => {
          filter.set('engine', value);
        }}
        options={[
          { value: 'all', label: 'All engines' },
          ...engines.map((value) => ({ value, label: geoSurfaces[value].label })),
        ]}
      />
      <Choice
        label="Prompt"
        value={filter.promptId || 'all'}
        set={(value) => {
          filter.set('promptId', value);
        }}
        options={[
          { value: 'all', label: 'All prompts' },
          ...(data.project?.questions ?? []).map((q) => ({ value: q.id, label: q.text })),
        ]}
      />
    </div>
  );
}
function ScopeLabel({ filter }: { filter: ReturnType<typeof useEvidenceFilter> }) {
  const { data } = useOutletContext<WorkspaceContext>();
  return (
    <p className={`min-w-0 break-words ${small}`}>
      {data.project?.brandName} · Last {filter.days} days ·{' '}
      {filter.engine ? geoSurfaces[filter.engine].label : 'All engines'} ·{' '}
      {filter.promptId ? 'Selected prompt' : 'All prompt versions'} · UTC daily samples
    </p>
  );
}
const pendingRun = (run: GeoRun) => run.completedAt === null;
function GeoRunProgress({ id, onComplete }: { id: string; onComplete?: () => void }) {
  const run = useResource<GeoRun>(`/geo/runs/${encodeURIComponent(id)}`, pendingRun);
  const refreshed = useRef(false);
  // Refresh once after the durable run settles; polling continues to retain every partial result.
  const done = run.data && !pendingRun(run.data);
  useEffect(() => {
    if (done && !refreshed.current) {
      refreshed.current = true;
      onComplete?.();
    }
  }, [done, onComplete]);
  return (
    <section className={`${box} space-y-3`} aria-live="polite">
      <ErrorNotice error={run.error} />
      {run.data ? (
        <>
          <h2 className="font-semibold">
            {run.data.items.filter((i) => i.status === 'succeeded').length} of{' '}
            {run.data.items.length} observations saved · {run.data.status}
          </h2>
          <p className={small}>
            {run.data.trigger} run · requested {time(run.data.createdAt)}. Successful captures
            remain available when another engine fails.
          </p>
          <ul className="space-y-2">
            {run.data.items.map((item) => (
              <li key={item.id} className="rounded-lg border p-3 text-sm">
                <span className="font-medium">{geoSurfaces[item.engine].label}</span> ·{' '}
                {words(item.status)}
                <p className={small}>{item.context.promptText}</p>
                {item.terminalReason && (
                  <p className="mt-1 text-sm text-amber-700">{item.terminalReason}</p>
                )}
                {item.status === 'submission_uncertain' && (
                  <p className={small}>
                    An operator must reconcile this submission before recovery. Another paid
                    submission will not be started automatically.
                  </p>
                )}
                {['pending', 'submitting', 'submitted'].includes(item.status) && (
                  <p className={small}>
                    Next eligible attempt: {time(item.dueAt)} · attempts {item.attemptsUsed}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p role="status">Loading monitoring run…</p>
      )}
    </section>
  );
}
export function GeoMonitor({
  promptIds,
  selectedEngines,
  onComplete,
  heading,
  children,
  compact = false,
}: {
  promptIds?: string[];
  selectedEngines?: GeoEngine[];
  onComplete?: () => void;
  heading?: ReactNode;
  children?: ReactNode;
  compact?: boolean;
}) {
  const { data } = useOutletContext<WorkspaceContext>();
  const settings = useResource<GeoSettings>('/geo/settings');
  const allowance = useResource<GeoAllowance>('/geo/allowance');
  const capabilities = useResource<GeoCapabilities>('/geo/capabilities');
  const history = useResource<GeoRunHistory>('/geo/runs', (value) =>
    value.runs.some((run) => run.completedAt === null),
  );
  const mutation = useMutation();
  const [params, setParams] = useSearchParams();
  const scopeEngines = selectedEngines ?? settings.data?.engines ?? [];
  const unavailable = scopeEngines.find((engine) => !capabilities.data?.engines[engine]?.available);
  const unselected = scopeEngines.find((engine) => !settings.data?.engines.includes(engine));
  const active = data.project?.questions.filter((q) => q.enabled && !q.archivedAt) ?? [];
  const promptLimit = data.promptLimit ?? data.plan?.promptLimit;
  const overLimit = promptLimit !== undefined && active.length > promptLimit;
  const inactivePrompt = Boolean(
    promptIds?.some((id) => !active.some((prompt) => prompt.id === id)),
  );
  const reason =
    settings.loading || allowance.loading || capabilities.loading
      ? 'Checking monitoring availability…'
      : (settings.error?.message ??
        allowance.error?.message ??
        capabilities.error?.message ??
        (!settings.data?.configured
          ? 'Save monitoring engines and configuration in Settings.'
          : overLimit
            ? `Your plan allows ${String(promptLimit)} active prompts. Pause prompts before starting another check.`
            : !allowance.data?.enabled
              ? allowanceReason(allowance.data?.reason)
              : !scopeEngines.length
                ? 'Choose at least one configured engine.'
                : unselected
                  ? `${geoSurfaces[unselected].label} is not selected in current monitoring settings.`
                  : unavailable
                    ? `${geoSurfaces[unavailable].label} is currently unavailable. Review your selected engines in Settings.`
                    : inactivePrompt
                      ? 'This scope includes an inactive or historical prompt. Choose active prompts for a fresh check.'
                      : !(promptIds?.length ?? active.length)
                        ? 'Add an active prompt before monitoring.'
                        : null));
  const allowanceBlocked = settings.data?.configured && allowance.data?.enabled === false;
  const supportRequired = allowanceBlocked && supportReasons.has(allowance.data?.reason ?? '');
  const promptBlocked =
    settings.data?.configured &&
    allowance.data?.enabled &&
    scopeEngines.length > 0 &&
    !unselected &&
    !unavailable &&
    (overLimit || inactivePrompt || !(promptIds?.length ?? active.length));
  const runId = params.get('geoRun') ?? history.data?.runs[0]?.id;
  const selectedRun = history.data?.runs.find((run) => run.id === runId);
  const showRun =
    params.has('geoRun') ||
    selectedRun?.completedAt === null ||
    selectedRun?.status === 'failed' ||
    selectedRun?.status === 'partial';
  const runDetails = runId && (
    <details
      className="space-y-3 rounded-lg border bg-card p-3"
      open={params.get('geoRun') ? true : undefined}
    >
      <summary className="cursor-pointer text-sm font-medium">
        {selectedRun
          ? `${selectedRun.trigger} check · ${String(selectedRun.successfulCount)}/${String(selectedRun.totalCount)} observations · ${selectedRun.status}`
          : 'Monitoring run details'}
      </summary>
      <GeoRunProgress
        key={runId}
        id={runId}
        onComplete={() => {
          void allowance.reload();
          void history.reload();
          onComplete?.();
        }}
      />
    </details>
  );
  return (
    <div className={compact ? 'space-y-2' : 'space-y-4'}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        {heading}
        <div className="shrink-0">
          <Button
            disabled={mutation.busy || Boolean(reason)}
            aria-describedby="geo-monitor-status"
            onClick={() =>
              void mutation.run(async () => {
                const run = await api<GeoRun>('/geo/runs', {
                  requestId: crypto.randomUUID(),
                  engines: scopeEngines,
                  ...(promptIds?.length ? { promptIds } : {}),
                });
                const next = new URLSearchParams(params);
                next.set('geoRun', run.id);
                setParams(next);
                await allowance.reload();
                await history.reload();
              })
            }
          >
            <RefreshCw
              className={`size-4 ${mutation.busy ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {mutation.busy ? 'Requesting check…' : 'Monitor Prompts'}
          </Button>
        </div>
      </div>
      <div
        className={`flex flex-wrap items-start justify-between gap-x-6 gap-y-2 ${compact ? 'px-1 py-1' : 'rounded-lg border bg-card px-3 py-2.5'}`}
      >
        <div className="min-w-0 flex-1 basis-72">
          <p id="geo-monitor-status" className={small}>
            {reason ??
              (data.plan
                ? `${String(scopeEngines.length)} engines · one check per prompt and engine per UTC day`
                : compact
                  ? `${String(scopeEngines.length)} engines · 5 min cooldown per prompt and engine`
                  : `Fresh check · ${String(scopeEngines.length)} selected engines · five-minute prompt/engine cooldown`)}
          </p>
          {reason && (
            <Link
              to={
                supportRequired
                  ? `mailto:${data.supportEmail}`
                  : allowanceBlocked
                    ? '/app/billing'
                    : promptBlocked
                      ? '/app/questions'
                      : '/app/settings'
              }
              className="text-xs font-medium text-primary underline underline-offset-4"
            >
              {supportRequired
                ? 'Contact support about monitoring'
                : allowanceBlocked
                  ? 'Review monitoring usage'
                  : promptBlocked
                    ? 'Review prompts'
                    : 'Review monitoring settings'}
            </Link>
          )}
        </div>
        <div className={small}>
          {allowance.data && (
            <>
              <span className="font-medium text-foreground">Monitoring usage</span>
              {' · '}
              {allowance.data.today} / {allowance.data.limits.projectDaily} attempts today{' · '}
              {allowance.data.month} / {allowance.data.limits.projectMonthly} this month
            </>
          )}
        </div>
      </div>
      <ErrorNotice error={mutation.error} />
      <ErrorNotice error={history.error} />
      {showRun && runDetails}
      {children}
      <details className="rounded-lg border bg-card p-3">
        <summary className="cursor-pointer text-sm font-medium">Monitoring details</summary>
        <div className="mt-3 space-y-3">
          {!showRun && runDetails}
          <div className="grid items-start gap-3 md:grid-cols-2">
            <details className="rounded-lg border bg-card px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium">
                Monitoring setup · {scopeEngines.length} selected engines
              </summary>
              <p className={`mt-3 ${small}`}>
                {scopeEngines.map((engine) => geoSurfaces[engine].label).join(' · ') ||
                  'No engines selected'}
              </p>
              <ol className="mt-4 space-y-4 text-sm">
                <li className="space-y-2">
                  <p className="font-medium">1. Choose answer engines</p>
                  <p className={small}>
                    Select up to four engines. Daily monitoring is{' '}
                    {settings.data?.dailyEnabled ? 'enabled' : 'disabled'}; availability reflects
                    configuration, with live access checked by your first capture.
                  </p>
                  <Link to="/app/settings" className="inline-block text-xs text-primary underline">
                    Configure engines
                  </Link>
                </li>
                <li className="space-y-2">
                  <p className="font-medium">2. Set buyer prompts</p>
                  <p className={small}>
                    {active.length} active prompts. Use the same neutral questions for the baseline
                    and follow-up.
                  </p>
                  <Link to="/app/questions" className="inline-block text-xs text-primary underline">
                    Review prompts
                  </Link>
                </li>
                <li className="space-y-2">
                  <p className="font-medium">3. Capture and review</p>
                  <p className={small}>
                    Monitor Prompts creates fresh observations. Review original answers and
                    diagnoses before accepting a playbook task.
                  </p>
                  <Link
                    to="/app/observations"
                    className="inline-block text-xs text-primary underline"
                  >
                    Inspect captured answers
                  </Link>
                </li>
              </ol>
            </details>
            <details className="space-y-3 rounded-lg border bg-card px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium">
                Recent checks · daily schedule{' '}
                {settings.data?.dailyEnabled ? 'enabled' : 'disabled'}
              </summary>
              <p className={small}>
                Latest ten runs and seven daily outcomes · UTC schedule. Opening a saved check does
                not start a provider call.
              </p>
              {history.data?.dailyOutcomes.map((outcome) => (
                <div key={outcome.date} className="rounded-lg border p-3 text-sm">
                  Daily {outcome.date} · {outcome.status}
                  <p className={small}>Last admission attempt {time(outcome.lastAttemptAt)}</p>
                  {outcome.reason && (
                    <p className="mt-1 text-amber-700">{allowanceReason(outcome.reason)}</p>
                  )}
                </div>
              ))}
              {history.data?.runs.map((run) => (
                <Button
                  key={run.id}
                  variant="outline"
                  className="h-auto w-full justify-start whitespace-normal text-left"
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.set('geoRun', run.id);
                    setParams(next);
                  }}
                >
                  {run.trigger} · {time(run.createdAt)} · {run.successfulCount}/{run.totalCount}{' '}
                  observations · {run.status}
                </Button>
              ))}
              {history.data && !history.data.runs.length && !history.data.dailyOutcomes.length && (
                <p className={small}>No monitoring outcomes recorded yet.</p>
              )}
            </details>
          </div>
        </div>
      </details>
    </div>
  );
}
function ObservationProof({
  observation,
  full = false,
}: {
  observation: GeoObservation;
  full?: boolean;
}) {
  const [viewedAt] = useState(() => Date.now());
  const mutation = useMutation();
  const run = useResource<GeoRun>(`/geo/runs/${encodeURIComponent(observation.runId)}`);
  const { context, capture } = observation;
  async function download() {
    const raw = await api<unknown>(`/geo/observations/${encodeURIComponent(observation.id)}/raw`);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(raw, null, 2)], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `geo-observation-${observation.id.replace(/[^a-zA-Z0-9_-]/g, '')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section
      id="original-evidence"
      className={`${box} min-w-0 scroll-mt-20 space-y-4`}
      aria-label="Original observation evidence"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <FileSearch className="size-4 text-primary" aria-hidden="true" />
          Original answer evidence
        </h2>
        <CaptureBadge quality={capture.quality} />
      </div>
      <div className="rounded-lg border bg-muted/20 p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Prompt sent to provider
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm">{context.promptText}</p>
        <p className={`mt-3 ${small}`}>
          {geoSurfaces[observation.engine].label} · requested{' '}
          {run.loading ? 'loading…' : run.data ? time(run.data.createdAt) : 'time unavailable'} ·
          captured {time(observation.capturedAt)}
        </p>
        <details className={small}>
          <summary className="cursor-pointer font-medium">Capture details</summary>
          <p className="mt-2">
            Surface: {words(context.surface)} · Collector: {words(context.collector)} · Model:{' '}
            {capture.modelReported
              ? (capture.model ?? 'Missing model metadata')
              : 'Not reported by this surface'}
          </p>
        </details>
      </div>
      {run.error && (
        <p className={small}>
          Run provenance could not load: {run.error.message} Original capture remains readable;
          request time is not inferred from capture time.
        </p>
      )}
      {capture.answerText ? (
        <blockquote
          className={`border-l-2 border-primary/35 pl-4 ${full ? '' : 'max-h-64 overflow-auto'}`}
          tabIndex={full ? undefined : 0}
          aria-label={full ? undefined : 'Saved answer preview'}
        >
          <AnswerMarkdown text={capture.answerText} />
        </blockquote>
      ) : (
        <Empty>
          {capture.quality === 'no_feature'
            ? 'The provider returned no answer feature. This is not evidence of brand absence.'
            : 'Answer text is unavailable. The stored provider envelope remains inspectable.'}
        </Empty>
      )}
      <p className={small}>
        Original saved answer, not a generated summary.{' '}
        {capture.quality === 'partial'
          ? 'Parsing is partial; incomplete evidence is not counted as brand absence.'
          : 'Each saved answer represents one check.'}
        {viewedAt - Date.parse(observation.capturedAt) > 86400000 &&
          ' This saved observation is older than 24 hours; it remains historical evidence.'}
      </p>
      {full && (
        <>
          <section
            id="answer-sources"
            tabIndex={-1}
            className="scroll-mt-20 space-y-3 outline-none"
          >
            <h3 className="font-medium">Sources and reference strength</h3>
            <details>
              <summary className="cursor-pointer text-xs font-medium">About these results</summary>
              <p className={`mt-2 ${small}`}>
                API results may differ from consumer AI apps. Brand mentions do not establish
                recommendations or rankings. Returned search results, answer references, element
                references and verified inline references remain distinct. Reference linkage does
                not establish factual support.
              </p>
            </details>
            {!capture.sources.length && <Empty>No source records returned with this answer.</Empty>}
            {capture.sources.map((source) => (
              <div key={source.id} className="rounded-lg border p-3 text-sm">
                <div className="flex min-w-0 items-start gap-2">
                  <SourceIcon url={source.url} />
                  <SafeSource url={source.url}>{source.title ?? source.url}</SafeSource>
                </div>
                <p className="mt-2 text-xs">
                  {source.referenceLevel === 'retrieved'
                    ? 'Returned search result · citation use unverified'
                    : source.referenceLevel === 'answer'
                      ? 'Displayed answer reference · no verified text span'
                      : source.referenceLevel === 'element'
                        ? 'Answer element reference · no verified text span'
                        : 'Verified inline reference'}
                  {source.spans?.length
                    ? ` · ${String(source.spans.length)} provider-linked spans`
                    : ''}
                </p>
              </div>
            ))}
          </section>
          <details className="border-t pt-3">
            <summary className="cursor-pointer text-sm font-medium">
              Frozen context and capture provenance
            </summary>
            <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-2 text-xs">
              <dt>Run</dt>
              <dd className="break-all">{observation.runId}</dd>
              <dt>Prompt version</dt>
              <dd className="break-all">{observation.promptVersionId}</dd>
              <dt>Context / settings</dt>
              <dd>
                {context.contextVersion} / {context.settingsRevision}
              </dd>
              <dt>Language / location</dt>
              <dd>
                {context.languageCode} / {context.locationCode}
                {!geoSurfaces[observation.engine].supportsLocale &&
                  ' · collector does not support locale selection'}
              </dd>
              <dt>Device</dt>
              <dd>
                {context.device}
                {!geoSurfaces[observation.engine].supportsDevice &&
                  ' · collector does not support device selection'}
              </dd>
              <dt>Collector version</dt>
              <dd>{context.collectorVersion}</dd>
              <dt>Instruction</dt>
              <dd>{context.instructionVersion}</dd>
              <dt>Provider request</dt>
              <dd className="break-all">{capture.providerRequestId ?? 'Not reported'}</dd>
              <dt>Reported cost</dt>
              <dd>
                {capture.reportedCost === null
                  ? 'Unknown'
                  : `$${capture.reportedCost.toFixed(6)} USD`}
              </dd>
              <dt>Token usage</dt>
              <dd>
                {capture.inputTokens ?? 'Unknown'} input / {capture.outputTokens ?? 'Unknown'}{' '}
                output
              </dd>
              <dt>Frozen brand</dt>
              <dd>
                {context.brand.name} · {context.brand.domain ?? 'No domain'}
              </dd>
              <dt>Frozen competitors</dt>
              <dd>{context.competitors.map((c) => c.name).join(', ') || 'None'}</dd>
            </dl>
            <p className={`mt-3 ${small}`}>
              Parsed provider JSON retained with the immutable capture; not a byte-for-byte HTTP
              archive. Brand and competitor context is used after capture; this neutral prompt is
              the query that was sent.
            </p>
          </details>
        </>
      )}
      <ErrorNotice error={mutation.error} />
      <div className="flex flex-wrap gap-2">
        {!full && (
          <Button variant="outline" size="sm" asChild>
            <Link to={`/app/observations/${encodeURIComponent(observation.id)}`}>
              View full answer & provenance
              <ArrowRight className="size-3" aria-hidden="true" />
            </Link>
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={mutation.busy}
          onClick={() => void mutation.run(download)}
        >
          Download original response JSON
        </Button>
      </div>
    </section>
  );
}
const metricLabels: Record<GeoMetric, string> = {
  mention: 'Brand mentioned',
  recommendation: 'Brand recommended',
  owned_answer_reference: 'Website referenced',
  owned_inline_reference: 'Website cited inline',
  overview_occurrence: 'AI answer available',
};
function TrendChart({
  trends,
  actions,
  observations,
  filter,
}: {
  trends: GeoTrends;
  actions: GeoAction[];
  observations: GeoObservation[];
  filter: ReturnType<typeof useEvidenceFilter>;
}) {
  const onTrendsPage = useLocation().pathname === '/app/trends';
  const [metric, setMetric] = useState<GeoMetric>('mention');
  const [selectedSeries, setSelectedSeries] = useState('');
  const [pins, setPins] = useState<GeoPinMeasurement[]>([]);
  const collectPins = useCallback((loaded: GeoPinMeasurement[]) => {
    setPins((previous) => [
      ...previous.filter((pin) => !loaded.some((next) => next.eventId === pin.eventId)),
      ...loaded,
    ]);
  }, []);
  const samples = trends.samples.filter((sample) => sample.metric === metric);
  const series = Array.from(new Set(samples.map((sample) => sample.cohort)));
  const activeSeries = series.includes(selectedSeries) ? selectedSeries : series[0];
  const selected = samples
    .filter((sample) => sample.cohort === activeSeries)
    .sort((a, b) => a.day.localeCompare(b.day));
  const annotationPins = pins.filter(
    (pin) =>
      Date.parse(pin.recordedAt) >= Date.parse(trends.asOf) - Number(filter.days) * 86400000 &&
      Date.parse(pin.recordedAt) <= Date.parse(trends.asOf) &&
      pin.cohorts.some((cohort) => cohort.keys[metric] === activeSeries),
  );
  const chart: { day: string; value: number | null; observationId: string | null }[] = [];
  const end = new Date(trends.asOf);
  end.setUTCHours(0, 0, 0, 0);
  for (let offset = Number(filter.days); offset >= 0; offset--) {
    const day = new Date(end.getTime() - offset * 86400000).toISOString().slice(0, 10);
    const sample = selected.find((sample) => sample.day === day);
    chart.push({
      day,
      value: sample ? sample.value * 100 : null,
      observationId: sample?.observationId ?? null,
    });
  }
  for (const pin of annotationPins) {
    const day = pin.recordedAt.slice(0, 10);
    if (!chart.some((point) => point.day === day))
      chart.push({ day, value: null, observationId: null });
  }
  chart.sort((a, b) => a.day.localeCompare(b.day));
  return (
    <section className={`${box} space-y-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Visibility over time</h2>
          {!onTrendsPage && (
            <Link className="text-xs text-primary underline" to={`/app/trends?${filter.query}`}>
              View trends
            </Link>
          )}
          <p className={small}>
            First eligible answer per UTC day · one comparable series at a time
          </p>
        </div>
        <Choice
          label="Metric"
          value={metric}
          set={(value) => {
            setMetric(value as GeoMetric);
          }}
          options={Object.entries(metricLabels).map(([value, label]) => ({ value, label }))}
        />
      </div>
      {series.length > 0 && (
        <Choice
          label="Comparable series"
          value={activeSeries ?? ''}
          set={setSelectedSeries}
          options={series.map((value, index) => {
            const count = samples.filter((sample) => sample.cohort === value).length;
            const capture = observations.find((observation) =>
              samples.some(
                (sample) => sample.cohort === value && sample.observationId === observation.id,
              ),
            );
            return {
              value,
              label: `Series ${String(index + 1)} · ${capture ? `${geoSurfaces[capture.engine].label} · ${capture.context.promptText}` : (samples.find((sample) => sample.cohort === value)?.day ?? 'Saved context')} · ${String(count)} daily ${count === 1 ? 'sample' : 'samples'}`,
            };
          })}
        />
      )}
      {selected.length ? (
        <>
          <div
            className="h-60 w-full"
            role="img"
            aria-label={`${metricLabels[metric]} for selected comparable series. ${String(selected.reduce((sum, sample) => sum + sample.value, 0))} of ${String(selected.length)} eligible daily samples.`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 12, right: 10, bottom: 0, left: -22 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(day: string) => day.slice(5)}
                  padding={{ left: 8, right: 16 }}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 100]}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(value) => `${String(value)}%`}
                />
                <Tooltip />
                <Line
                  type="linear"
                  dataKey="value"
                  name={metricLabels[metric]}
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  isAnimationActive={false}
                  connectNulls={false}
                />
                {annotationPins
                  .filter((pin) => chart.some((point) => point.day === pin.recordedAt.slice(0, 10)))
                  .map((pin) => (
                    <ReferenceLine
                      key={pin.eventId}
                      x={pin.recordedAt.slice(0, 10)}
                      stroke="var(--color-chart-2)"
                      strokeDasharray="4 3"
                      label={{ value: 'Action', fontSize: 10 }}
                    />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {selected.length === 1 && (
            <p className={small}>
              One daily result is available. More checks are needed to show a trend.
            </p>
          )}
          <p className={small}>
            {selected.reduce((sum, sample) => sum + sample.value, 0)} of {selected.length} eligible
            daily answers meet this metric. Rates are provisional and require review.
          </p>
          <details>
            <summary className="cursor-pointer text-xs font-medium">
              Inspect daily sample evidence
            </summary>
            <p className={`mt-2 break-all ${small}`}>Frozen cohort: {activeSeries}</p>
            <ul className="mt-2 space-y-2">
              {selected.map((sample) => (
                <li key={`${sample.cohort}-${sample.day}`} className={small}>
                  {sample.day} · {sample.value ? 'Present' : 'Absent'} ·{' '}
                  <Link
                    className="text-primary underline"
                    to={`/app/observations/${encodeURIComponent(sample.observationId)}`}
                  >
                    Original daily answer
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : (
        <Empty>
          No eligible daily samples for this metric. Captures with missing, uncertain or incomplete
          classification remain available in Answers.
        </Empty>
      )}
      <details className="border-t pt-3">
        <summary className="cursor-pointer text-xs font-medium">How this is measured</summary>
        <p className={`mt-3 ${small}`}>
          {trends.method} Measurement {trends.version}. Scope: {trends.captures} captures,{' '}
          {trends.classifiedCaptures} usable complete classifications. Different prompt versions,
          configuration or reported models start separate cohorts; they are not joined as a
          comparable series. Pins are annotated only when their affected frozen scope is identified
          on this loaded cohort.
        </p>
      </details>
      <ActionPins actions={actions} filter={filter} onPins={collectPins} />
    </section>
  );
}
function ActionPins({
  actions,
  filter,
  onPins,
}: {
  actions: GeoAction[];
  filter: ReturnType<typeof useEvidenceFilter>;
  onPins?: (pins: GeoPinMeasurement[]) => void;
}) {
  const relevant = actions.filter((action) =>
    action.scopes.some(
      (scope) =>
        (!filter.engine || scope.context.engine === filter.engine) &&
        (!filter.promptId || scope.context.promptId === filter.promptId),
    ),
  );
  return (
    <details className="space-y-3 border-t pt-3">
      <summary className="cursor-pointer text-sm font-medium">
        <MapPin className="mr-2 inline size-4" aria-hidden="true" />
        Action pins & comparisons
      </summary>
      <p className={small}>
        Completion time and reported implementation time are distinct. Changes after a pin show
        correlation, not causality or financial ROI.
      </p>
      {relevant.length ? (
        relevant.map((action) => (
          <PinMeasurements
            key={`${action.id}-${String(action.revision)}`}
            action={action}
            days={Number(filter.days)}
            filter={filter}
            onPins={onPins}
          />
        ))
      ) : (
        <Empty>No actions affect this selected prompt and engine scope.</Empty>
      )}
    </details>
  );
}
function PinMeasurements({
  action,
  days,
  filter,
  onPins,
}: {
  action: GeoAction;
  days: number;
  filter?: { engine?: string; promptId: string };
  onPins?: (pins: GeoPinMeasurement[]) => void;
}) {
  const [viewedAt] = useState(() => Date.now());
  const measurements = useResource<GeoPinMeasurement[]>(
    `/geo/actions/${encodeURIComponent(action.id)}/measurements`,
  );
  const relevant =
    measurements.data?.filter(
      (pin) =>
        Date.parse(pin.recordedAt) >= viewedAt - days * 86400000 &&
        pin.cohorts.some(
          ({ scope }) =>
            (!filter?.engine || scope.context.engine === filter.engine) &&
            (!filter?.promptId || scope.context.promptId === filter.promptId),
        ),
    ) ?? [];
  useEffect(() => {
    if (measurements.data)
      onPins?.(
        measurements.data.filter(
          (pin) =>
            Date.parse(pin.recordedAt) >= viewedAt - days * 86400000 &&
            pin.cohorts.some(
              ({ scope }) =>
                (!filter?.engine || scope.context.engine === filter.engine) &&
                (!filter?.promptId || scope.context.promptId === filter.promptId),
            ),
        ),
      );
  }, [measurements.data, days, onPins, viewedAt, filter?.engine, filter?.promptId]);
  return (
    <div className="space-y-2">
      <ErrorNotice error={measurements.error} />
      {measurements.loading && (
        <p role="status" className={small}>
          Loading completed work…
        </p>
      )}
      {measurements.data && !relevant.length && (
        <p className={small}>{action.title}: no completed work recorded in this period.</p>
      )}
      {relevant.map((pin) => (
        <div key={pin.eventId} className="space-y-2 rounded-lg border p-3">
          <Link
            className="text-sm font-medium text-primary underline"
            to={`/app/playbook/${encodeURIComponent(action.id)}`}
          >
            {action.title}
          </Link>
          <p className={small}>
            {actionCategories[action.category]} · recorded {time(pin.recordedAt)} · work completed{' '}
            {time(pin.implementedAt)}
          </p>
          <p className="whitespace-pre-wrap break-words text-sm">{pin.changeDescription}</p>
          {pin.changeUrl && <SafeSource url={pin.changeUrl}>Implemented change</SafeSource>}
          <p className={small}>
            Before: {time(pin.beforeWindow.from)} — {time(pin.beforeWindow.to)}
            <br />
            After: {time(pin.afterWindow.from)} — {time(pin.afterWindow.to)} ·{' '}
            {pin.windowComplete ? 'Follow-up period finished' : 'Follow-up period in progress'}
          </p>
          {pin.metrics.map((metric) => (
            <p key={metric.metric} className={small}>
              {metricLabels[metric.metric]}:{' '}
              <strong className="text-foreground">{words(metric.outcome)}</strong> ·{' '}
              {metric.before === null ? 'Unknown' : `${String(Math.round(metric.before * 100))}%`} (
              {metric.beforeSamples} samples) →{' '}
              {metric.after === null ? 'Unknown' : `${String(Math.round(metric.after * 100))}%`} (
              {metric.afterSamples} samples) ·{' '}
              {metric.scopeComplete ? 'Full comparison' : 'Incomplete comparison'}
              {metric.limitedData && ' · limited data'}
            </p>
          ))}
          <p className={small}>
            These results compare saved answers. They do not prove your work caused a change or
            increased revenue.
          </p>
          <details>
            <summary className="cursor-pointer text-xs">
              Comparison details & supporting answers
            </summary>
            {pin.limitations.map((note) => (
              <p key={note} className={`mt-2 ${small}`}>
                {note}
              </p>
            ))}
            <ul className="mt-2 space-y-1">
              {Array.from(new Set(pin.metrics.flatMap((metric) => metric.observationIds))).map(
                (id) => (
                  <li key={id}>
                    <Link
                      className="break-all text-xs text-primary underline"
                      to={`/app/observations/${encodeURIComponent(id)}`}
                    >
                      Original observation {id}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </details>
        </div>
      ))}
    </div>
  );
}
export function GeoOverview() {
  const { data } = useOutletContext<WorkspaceContext>();
  const filter = useEvidenceFilter();
  const observations = useResource<GeoObservationPage>(`/geo/observations?${filter.query}`, true);
  const trends = useResource<GeoTrends>(`/geo/trends?${filter.query}`);
  const actions = useResource<GeoAction[]>('/geo/actions', true);
  const analyses = useResource<GeoAnalysis[]>('/geo/analyses', true);
  const completedAnalyses =
    analyses.data
      ?.filter((analysis) => analysis.state === 'completed')
      .map((analysis) => `${analysis.id}:${analysis.completedAt ?? ''}`)
      .join(',') ?? '';
  const previousAnalyses = useRef<string | null>(null);
  const reloadTrends = trends.reload;
  useEffect(() => {
    if (previousAnalyses.current !== null && previousAnalyses.current !== completedAnalyses)
      void reloadTrends();
    previousAnalyses.current = completedAnalyses;
  }, [completedAnalyses, reloadTrends]);
  const [selected, setSelected] = useState('');
  const proof =
    observations.data?.observations.find((o) => o.id === selected) ??
    observations.data?.observations[0];
  const jobs =
    actions.data
      ?.filter(
        (action) =>
          !['dismissed', 'completed'].includes(action.status) &&
          action.scopes.some(
            (scope) =>
              (!filter.engine || scope.context.engine === filter.engine) &&
              (!filter.promptId || scope.context.promptId === filter.promptId),
          ),
      )
      .sort((a, b) => a.priority - b.priority) ?? [];
  const classification = proof
    ? analyses.data?.find((analysis) => analysis.observationId === proof.id)
    : undefined;
  const latestCapture = observations.data?.observations[0]?.capturedAt;
  if (!data.project) return <Navigate to="/app/onboarding" replace />;
  return (
    <section className="space-y-5">
      <GeoMonitor
        heading={
          <div className="min-w-0 flex-1 basis-96">
            <h1 className="text-2xl font-semibold tracking-tight">Visibility & action overview</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your AI visibility, the evidence behind it, and what to improve next.
            </p>
          </div>
        }
        promptIds={filter.promptId ? [filter.promptId] : undefined}
        selectedEngines={filter.engine ? [filter.engine] : undefined}
        onComplete={() => {
          void observations.reload();
          void trends.reload();
          void actions.reload();
          void analyses.reload();
        }}
      >
        <div className="space-y-3">
          <EvidenceFilters filter={filter} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ScopeLabel filter={filter} />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-1 text-xs text-muted-foreground"
              onClick={() => {
                void observations.reload();
                void trends.reload();
                void actions.reload();
                void analyses.reload();
              }}
            >
              <RefreshCw className="size-3" aria-hidden="true" />
              Refresh saved evidence
            </Button>
          </div>
        </div>
        {[observations.error, trends.error, actions.error, analyses.error].map((error, index) => (
          <ErrorNotice key={index} error={error} />
        ))}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Monitoring summary">
          {[
            [
              'Saved observations',
              String(trends.data?.captures ?? '—'),
              `Selected ${filter.days}-day scope · includes absent AI features; failed captures excluded`,
            ],
            [
              'Classification coverage',
              trends.data
                ? `${String(trends.data.classifiedCaptures)} / ${String(trends.data.captures)}`
                : '—',
              'Usable complete classifications / captures',
            ],
            [
              'Work to review',
              actions.data ? String(jobs.length) : '—',
              actions.data
                ? `${String(jobs.filter((a) => a.category === 'owned').length)} Web / Owned · ${String(jobs.filter((a) => a.category === 'earned').length)} Earned Media`
                : 'Waiting for saved work',
            ],
            [
              'Evidence freshness',
              latestCapture
                ? relativeTime(latestCapture)
                : observations.data
                  ? 'No saved answer'
                  : '—',
              'Latest capture in the selected scope',
            ],
          ].map(([label, value, note]) => (
            <div key={label} className="min-w-0 rounded-xl border bg-card p-4 shadow-sm">
              <p className={small}>{label}</p>
              <p className="mt-2 break-words text-2xl font-semibold tabular-nums tracking-tight">
                {label === 'Evidence freshness' && latestCapture ? (
                  <time
                    dateTime={latestCapture}
                    title={time(latestCapture)}
                    aria-label={time(latestCapture)}
                  >
                    {value}
                  </time>
                ) : (
                  value
                )}
              </p>
              <p className={`mt-2 ${small}`}>{note}</p>
            </div>
          ))}
        </div>
      </GeoMonitor>
      {trends.loading ? (
        <p role="status">Loading daily cohort trends…</p>
      ) : (
        trends.data && (
          <TrendChart
            key={filter.query}
            trends={trends.data}
            actions={actions.data ?? []}
            observations={observations.data?.observations ?? []}
            filter={filter}
          />
        )
      )}
      <div className="grid items-start gap-5 xl:grid-cols-[1fr_1.15fr]">
        <section className={`${box} space-y-4`}>
          <div className="flex justify-between gap-3">
            <h2 className="font-semibold">Priority work</h2>
            <Link to="/app/playbook" className="text-xs text-primary">
              Full playbook →
            </Link>
          </div>
          {actions.loading ? (
            <p role="status">Loading work…</p>
          ) : actions.error ? (
            <Empty>Work is unavailable. Refresh saved evidence to try again.</Empty>
          ) : !jobs.length ? (
            <Empty>
              No proposed work in this scope. Review captured evidence and analysis; unavailable or
              uncertain classification does not imply an optimisation task.
            </Empty>
          ) : (
            jobs.slice(0, 5).map((action) => <ActionCard key={action.id} action={action} />)
          )}
          <h3 className="border-t pt-4 text-sm font-medium">Inspect a saved answer</h3>
          {observations.loading ? (
            <p role="status">Loading original observations…</p>
          ) : observations.error ? (
            <Empty>Saved answers are unavailable. Refresh saved evidence to try again.</Empty>
          ) : !observations.data?.observations.length ? (
            <Empty>
              No saved AI answers in this scope. Configure monitoring and capture your first
              baseline.
            </Empty>
          ) : (
            observations.data.observations.slice(0, 6).map((observation) => (
              <button
                key={observation.id}
                type="button"
                aria-pressed={proof?.id === observation.id}
                className={`w-full rounded-lg border p-3 text-left text-sm ${proof?.id === observation.id ? 'border-primary/40 bg-primary/5' : 'hover:bg-muted/30'}`}
                onClick={() => {
                  setSelected(observation.id);
                }}
              >
                <span className="block font-medium">{observation.context.promptText}</span>
                <span className={`mt-1 block ${small}`}>
                  {geoSurfaces[observation.engine].label} · {time(observation.capturedAt)} ·{' '}
                  {words(observation.capture.quality)}
                </span>
              </button>
            ))
          )}
          <Link
            to={`/app/observations?${filter.query}`}
            className="inline-block text-xs text-primary underline"
          >
            All answers & prompt × engine matrix
          </Link>
        </section>
        <div className="space-y-4">
          {proof ? (
            <>
              <ObservationProof key={proof.id} observation={proof} />
              <div className={`${box} space-y-2`}>
                <h3 className="text-sm font-medium">Classification · needs review</h3>
                <p className={small}>
                  {classification?.state === 'completed'
                    ? `${words(classification.classification.brandPresence)} · ${words(classification.classification.brandStance)} · ${classification.classification.model} · ${classification.classification.scope} scope`
                    : classification
                      ? `${classification.state}${classification.failureCode ? ` · ${classification.failureCode}` : ''}. Original capture retained.`
                      : 'Classification pending or unavailable. Original capture retained.'}
                </p>
                <Link
                  className="text-xs text-primary underline"
                  to={`/app/observations/${encodeURIComponent(proof.id)}`}
                >
                  Inspect decision probabilities & diagnoses
                </Link>
              </div>
            </>
          ) : (
            <section className={`${box} space-y-3`}>
              <h2 className="font-semibold">Original answer evidence</h2>
              <Empty>
                No original answer in the selected scope. A capture failure is not evidence that
                your brand is absent.
              </Empty>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}
export function GeoTrendsPage() {
  const filter = useEvidenceFilter();
  const trends = useResource<GeoTrends>(`/geo/trends?${filter.query}`);
  const observations = useResource<GeoObservationPage>(`/geo/observations?${filter.query}`);
  const actions = useResource<GeoAction[]>('/geo/actions');
  return (
    <section className="space-y-3">
      <WorkspaceHeading title="Trends" />
      <EvidenceFilters filter={filter} />
      <ScopeLabel filter={filter} />
      <ErrorNotice error={trends.error ?? observations.error ?? actions.error} />
      {trends.loading ? (
        <p role="status">Loading trends…</p>
      ) : trends.data ? (
        <TrendChart
          trends={trends.data}
          observations={observations.data?.observations ?? []}
          actions={actions.data ?? []}
          filter={filter}
        />
      ) : (
        <p className={small}>Trends are unavailable. Refresh to try again.</p>
      )}
    </section>
  );
}
export function GeoObservations() {
  const filter = useEvidenceFilter();
  const cursor = filter.params.get('cursor');
  const observations = useResource<GeoObservationPage>(
    `/geo/observations?${filter.query}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
  );
  const nextCursor = observations.data?.nextCursor;
  return (
    <section className="space-y-3">
      <WorkspaceHeading title="Answers" />
      <EvidenceFilters filter={filter} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ScopeLabel filter={filter} />
        <Link className="text-xs text-primary underline" to="/app/questions">
          Previous Perplexity answers
        </Link>
      </div>
      <ErrorNotice error={observations.error} />
      {observations.loading ? (
        <p role="status">Loading saved AI answers…</p>
      ) : observations.data ? (
        <>
          {!observations.data.observations.length ? (
            <Empty>No saved answers in this period and scope.</Empty>
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card">
              <table className="answers-table w-full table-fixed text-left text-sm">
                <caption className="sr-only">Saved answers in the selected scope</caption>
                <thead className="bg-muted/40">
                  <tr>
                    <th scope="col" className="w-[34%] px-3 py-2">
                      Answer
                    </th>
                    <th scope="col" className="w-[25%] px-3 py-2">
                      Prompt
                    </th>
                    <th scope="col" className="w-[18%] px-3 py-2">
                      Engine
                    </th>
                    <th scope="col" className="w-[12%] px-3 py-2">
                      Capture
                    </th>
                    <th scope="col" className="w-[11%] px-3 py-2">
                      Captured
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {observations.data.observations.map((observation) => (
                    <tr key={observation.id} className="border-t align-top hover:bg-muted/10">
                      <td className="px-3 py-2">
                        <div className="answer-preview line-clamp-2 break-words text-sm">
                          {observation.capture.answerText ? (
                            <AnswerMarkdown text={observation.capture.answerText} preview />
                          ) : observation.capture.quality === 'no_feature' ? (
                            'No AI answer was returned.'
                          ) : (
                            'Answer text unavailable.'
                          )}
                        </div>
                        <Link
                          className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
                          to={`/app/observations/${encodeURIComponent(observation.id)}?${filter.params}`}
                          state={{ returnTo: `/app/observations?${filter.params}` }}
                        >
                          View answer →
                        </Link>
                        <div>
                          <AnswerSources observation={observation} />
                        </div>
                      </td>
                      <th
                        scope="row"
                        data-label="Prompt"
                        className="break-words px-3 py-2 text-sm font-normal"
                      >
                        {observation.context.promptText}
                      </th>
                      <td className="px-3 py-2" data-label="Engine">
                        <span className="flex items-center gap-2 text-xs">
                          <EngineIcon engine={observation.engine} />
                          {geoSurfaces[observation.engine].label}
                        </span>
                      </td>
                      <td className="px-3 py-2" data-label="Capture">
                        <CaptureBadge quality={observation.capture.quality} />
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground" data-label="Captured">
                        <time dateTime={observation.capturedAt}>
                          {time(observation.capturedAt)}
                        </time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={small}>
              {observations.data.observations.length}{' '}
              {observations.data.observations.length === 1 ? 'answer' : 'answers'} on this page
            </span>
            <div className="flex gap-2">
              {cursor && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const next = new URLSearchParams(filter.params);
                    next.delete('cursor');
                    filter.setParams(next);
                  }}
                >
                  First page
                </Button>
              )}
              {nextCursor && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const next = new URLSearchParams(filter.params);
                    next.set('cursor', nextCursor);
                    filter.setParams(next);
                  }}
                >
                  Older answers
                </Button>
              )}
            </div>
          </div>
          <details className="rounded-lg border bg-card p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Answers by prompt and engine
            </summary>
            <div className="mt-3">
              <PromptMatrix observations={observations.data.observations} />
            </div>
          </details>
        </>
      ) : (
        <p className={small}>Saved answers are unavailable. Refresh to try again.</p>
      )}
    </section>
  );
}
function PromptMatrix({ observations }: { observations: GeoObservation[] }) {
  const { data } = useOutletContext<WorkspaceContext>();
  const [params] = useSearchParams();
  return (
    <section className={`${box} space-y-3`}>
      <h2 className="font-semibold">Prompt × engine evidence matrix</h2>
      <p className={small}>
        Latest observation on this loaded page, per prompt and engine. An empty cell means no answer
        on this page; it is not a failed check or brand absence. Open a capture to inspect its
        frozen prompt version.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-xs">
          <thead>
            <tr className="border-b">
              <th scope="col" className="p-2">
                Prompt
              </th>
              {engines.map((engine) => (
                <th key={engine} scope="col" className="p-2">
                  {geoSurfaces[engine].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data.project?.questions ?? []).map((prompt) => (
              <tr key={prompt.id} className="border-b last:border-0">
                <th scope="row" className="max-w-60 p-2 font-medium">
                  {prompt.text}
                </th>
                {engines.map((engine) => {
                  const observation = observations
                    .filter((o) => o.context.promptId === prompt.id && o.engine === engine)
                    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
                  return (
                    <td key={engine} className="p-2">
                      {observation ? (
                        <Link
                          className="text-primary underline"
                          to={`/app/observations/${encodeURIComponent(observation.id)}?${params}`}
                        >
                          <CaptureBadge quality={observation.capture.quality} />
                          <span className="mt-1 block text-muted-foreground">
                            {time(observation.capturedAt)}
                          </span>
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">No capture on page</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
const analysisPending = (values: GeoAnalysis[]) =>
  values.some((value) => ['queued', 'running'].includes(value.state));
const analysisLabels = {
  usable: 'Relevant answer',
  irrelevant: 'Off-topic answer',
  refusal: 'No answer provided',
  incomplete: 'Incomplete answer',
  unknown: 'Not determined',
  present: 'Mentioned',
  absent: 'Not mentioned',
  ambiguous: 'Unclear',
  recommended: 'Recommended',
  conditional_recommendation: 'Recommended with conditions',
  neutral_mention: 'Mentioned without a recommendation',
  discouraged: 'Not recommended',
  not_applicable: 'Not applicable',
  supported: 'Supported',
  insufficient: 'Not enough evidence',
  contradicted: 'Conflicting evidence',
  unavailable: 'Not available',
};
const findingTitles = {
  retrieval_problem: 'Check how your brand is found',
  evidence_problem: 'Verify the evidence behind product claims',
  recommendation_fit_problem: 'Review fit with buyer needs',
};
const findingReasons: Record<string, string> = {
  measured_owned_page_obstacle:
    'A page check found an access or indexing issue on your website. Confirm whether it affects this answer engine.',
  brand_and_owned_reference_not_observed:
    'Your brand and website were not found in this saved answer. That alone does not explain why.',
  buyer_evidence_requires_verification:
    'The answer may lack supporting evidence or conflict with product claims. Check the current facts and sources.',
  reported_rejection_or_fit_mismatch:
    'The answer discouraged your brand or suggested a mismatch with buyer requirements. Verify the product details.',
};
const nextCheckLabels: Record<string, string> = {
  inspect_owned_page: 'Review your website',
  verify_engine_applicability: 'Confirm whether the findings apply to this engine',
  verify_current_product_fact: 'Verify current product facts',
  verify_product_limitation: 'Verify the reported product limitation',
};
function AnalysisCard({ analysis, returnTo }: { analysis: GeoAnalysis; returnTo?: string }) {
  const classification = analysis.classification;
  const evidenceGroups: NonNullable<GeoAnalysis['classification']>['evidence'][] = [];
  for (const evidence of classification?.evidence ?? []) {
    const group = evidenceGroups.at(-1);
    // Adjacent classifier chunks can split a Markdown word, link or emphasis marker.
    if (group?.at(-1)?.end === evidence.start) group.push(evidence);
    else evidenceGroups.push([evidence]);
  }
  return (
    <article className={`${box} space-y-3`}>
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="font-semibold">Answer analysis</h3>
        <Badge variant={analysis.state === 'failed' || classification ? 'warning' : 'secondary'}>
          {classification
            ? 'Needs review'
            : analysis.state === 'failed'
              ? 'Analysis unavailable'
              : analysis.state === 'running'
                ? 'Analyzing answer'
                : 'Waiting for analysis'}
        </Badge>
      </div>
      <p className={small}>Requested {time(analysis.createdAt)}</p>
      {classification ? (
        <>
          <div className="grid gap-3 rounded-lg bg-muted/40 p-4 text-sm sm:grid-cols-2">
            <p>
              Answer relevance: <strong>{analysisLabels[classification.answerQuality]}</strong>
            </p>
            <p>
              Your brand: <strong>{analysisLabels[classification.brandPresence]}</strong>
            </p>
            <p>
              Recommendation: <strong>{analysisLabels[classification.brandStance]}</strong>
            </p>
            <p>
              Source support: <strong>{analysisLabels[classification.evidenceSupport]}</strong>
            </p>
          </div>
          {classification.scope === 'partial' && (
            <p className="text-sm text-amber-800">
              This analysis covers only part of the saved answer. Review the full answer before
              drawing conclusions.
            </p>
          )}
          {evidenceGroups.length > 0 && (
            <h4 className="text-sm font-medium">Supporting excerpts</h4>
          )}
          {evidenceGroups.map((group) => (
            <blockquote key={group[0]?.id} className="space-y-2 border-l-2 pl-3">
              <AnswerMarkdown text={group.map((evidence) => evidence.quote).join('')} />
            </blockquote>
          ))}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Findings to review</h4>
            {!analysis.diagnoses.length && (
              <Empty>
                No findings were established from this analysis. This does not rule out issues.
              </Empty>
            )}
            {analysis.diagnoses.map((diagnosis, index) => (
              <div
                key={`${diagnosis.type}-${String(index)}`}
                className="rounded-lg border p-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{findingTitles[diagnosis.type]}</strong>
                  <Badge variant="outline">
                    {
                      {
                        suspected: 'Possible issue',
                        supported: 'Evidence found',
                        ruled_out: 'Ruled out',
                        unknown: 'Not determined',
                      }[diagnosis.status]
                    }
                  </Badge>
                </div>
                <p className="mt-2">
                  {findingReasons[diagnosis.reasonCode] ??
                    'Review the original answer and supporting sources to assess this finding.'}
                </p>
                {diagnosis.targetUrl && (
                  <SafeSource url={diagnosis.targetUrl}>Target page</SafeSource>
                )}
                {diagnosis.missingChecks.length > 0 && (
                  <p className={`mt-2 ${small}`}>
                    Next checks:{' '}
                    {diagnosis.missingChecks
                      .map((check) => nextCheckLabels[check] ?? 'Review supporting evidence')
                      .join('; ')}
                    .
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className={small}>
            Suggested findings need your review. A saved answer alone does not establish the cause.
          </p>
        </>
      ) : (
        <Empty>
          {analysis.state === 'failed'
            ? 'The analysis could not be completed.'
            : analysis.state === 'running'
              ? 'The saved answer is being analyzed.'
              : 'The saved answer is waiting to be analyzed.'}{' '}
          You can still review the original answer.
        </Empty>
      )}
      <details className="border-t pt-3">
        <summary className="cursor-pointer text-sm font-medium">Analysis details</summary>
        <div className={`mt-3 space-y-3 ${small}`}>
          <p>
            {analysis.model} · {time(analysis.createdAt)} · rubric {analysis.rubricVersion} · policy{' '}
            {analysis.policyVersion} · state {analysis.state}
          </p>
          {analysis.failureCode && <p>Failure code: {analysis.failureCode}</p>}
          {classification && (
            <>
              <p>
                {classification.scope} answer scope · returned model {classification.model} ·
                provider {classification.provider} · ownership {classification.ownershipVersion}
              </p>
              <h4 className="font-medium text-foreground">Assessment criteria</h4>
              {Object.entries(classification.fitByCriterion).map(([criterion, fit]) => (
                <p key={criterion}>
                  {criterion}: {words(fit)}
                </p>
              ))}
              <h4 className="font-medium text-foreground">Evidence references</h4>
              {classification.evidence.map((evidence) => (
                <p key={evidence.id}>
                  Original answer offsets {evidence.start}–{evidence.end} · support probability{' '}
                  {evidence.supportProbability} · evidence {evidence.id}
                </p>
              ))}
              <h4 className="font-medium text-foreground">Persisted diagnoses</h4>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/30 p-3">
                {JSON.stringify(analysis.diagnoses, null, 2)}
              </pre>
              <h4 className="font-medium text-foreground">Model response</h4>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/30 p-3">
                {JSON.stringify(classification.native, null, 2)}
              </pre>
              <p>
                Native probabilities express model uncertainty; they are not validated performance
                guarantees.
              </p>
            </>
          )}
          <p>
            Analysis {analysis.id} · input hash {analysis.inputHash ?? 'Unavailable'} ·{' '}
            {analysis.latencyMs === null
              ? 'Latency unavailable'
              : `${String(analysis.latencyMs)} ms`}{' '}
            · estimated cost{' '}
            {analysis.estimatedCostUsd === null
              ? 'Unknown'
              : `$${analysis.estimatedCostUsd.toFixed(6)} USD`}
          </p>
        </div>
      </details>
      <Link
        className="inline-block text-xs text-primary underline"
        to={`/app/observations/${encodeURIComponent(analysis.observationId)}`}
        state={returnTo ? { returnTo } : undefined}
      >
        View original answer
      </Link>
    </article>
  );
}
export function GeoObservationDetail() {
  const location = useLocation();
  const returnTo = answerReturnTo(location.state);
  const [params] = useSearchParams();
  const { observationId = '' } = useParams();
  const path = `/geo/observations/${encodeURIComponent(observationId)}`;
  const observation = useResource<GeoObservation>(path);
  const analyses = useResource<GeoAnalysis[]>(`${path}/analyses`, analysisPending);
  const actions = useResource<GeoAction[]>('/geo/actions');
  const checks = useResource<GeoPageCheck[]>(`${path}/page-checks`, true);
  const capabilities = useResource<GeoCapabilities>('/geo/capabilities');
  const mutation = useMutation();
  const [target, setTarget] = useState('');
  const checkedSources =
    observation.data?.capture.sources
      .filter((source) =>
        analyses.data?.some((analysis) =>
          analysis.classification?.sources.some(
            (role) => role.id === source.id && role.role === 'owned',
          ),
        ),
      )
      .map((source) => source.canonicalUrl) ?? [];
  const home = observation.data?.context.brand.domain
    ? `https://${observation.data.context.brand.domain}/`
    : null;
  const targets = Array.from(new Set([...checkedSources, ...(home ? [home] : [])]));
  const chosenTarget = targets.includes(target) ? target : targets[0];
  useEffect(() => {
    if (location.hash !== '#answer-sources' || !observation.data) return;
    const target = document.getElementById('answer-sources');
    target?.scrollIntoView({ block: 'start', behavior: 'instant' });
    target?.focus({ preventScroll: true });
  }, [location.hash, observation.data]);
  const latest = analyses.data?.[0];
  const relatedActions =
    actions.data?.filter((action) =>
      action.scopes.some((scope) => scope.observationId === observationId),
    ) ?? [];
  return (
    <section className="space-y-5">
      <WorkspaceHeading
        title="Answer details"
        description="Start with the original answer, then review the diagnosis and supporting checks."
      >
        <Link
          className="text-sm text-primary underline"
          to={returnTo ?? `/app/observations?${answerQuery(params)}`}
        >
          {returnTo?.startsWith('/app/sources')
            ? 'Back to Sources'
            : returnTo?.startsWith('/app/competitors')
              ? 'Back to Competitors'
              : returnTo?.startsWith('/app/diagnoses')
                ? 'Back to Diagnoses'
                : 'Back to Answers'}
        </Link>
      </WorkspaceHeading>
      <nav
        aria-label="Observation sections"
        className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-primary"
      >
        <a className="underline underline-offset-4" href="#original-evidence">
          Original answer
        </a>
        <a className="underline underline-offset-4" href="#decision-analysis">
          Answer analysis
        </a>
        <a className="underline underline-offset-4" href="#owned-page-checks">
          Owned page checks
        </a>
        <a className="underline underline-offset-4" href="#related-work">
          Related work
        </a>
      </nav>
      <ErrorNotice error={observation.error} />
      {observation.loading ? (
        <p role="status">Loading saved answer…</p>
      ) : (
        observation.data && <ObservationProof observation={observation.data} full />
      )}
      <section id="decision-analysis" className={`${box} scroll-mt-20 space-y-3`}>
        <h2 className="font-semibold">Analyze this answer</h2>
        <ErrorNotice error={mutation.error ?? capabilities.error ?? analyses.error} />
        <Button
          variant="outline"
          disabled={
            mutation.busy ||
            !observation.data ||
            !capabilities.data?.classifier.available ||
            latest?.state === 'queued' ||
            latest?.state === 'running'
          }
          onClick={() =>
            void mutation.run(async () => {
              await api(`${path}/analyses`, { requestId: crypto.randomUUID() });
              await analyses.reload();
            })
          }
        >
          {latest ? 'Reanalyse stored answer' : 'Analyse stored answer'}
        </Button>
        <p className={small}>
          {capabilities.data?.classifier.available
            ? 'Uses processing allowance to analyze the saved answer without running a new monitoring check.'
            : (capabilities.data?.classifier.reason ?? 'Checking analysis availability…')}{' '}
          Review the findings before acting.
        </p>
        {analyses.loading && <p role="status">Loading analysis history…</p>}
        {analyses.data?.length === 0 && (
          <Empty>
            No analysis is available for this answer yet. You can still review the saved answer and
            its sources.
          </Empty>
        )}
      </section>
      {analyses.data?.map((analysis) => (
        <AnalysisCard key={analysis.id} analysis={analysis} />
      ))}
      <section
        id="related-work"
        aria-labelledby="related-work-title"
        className="scroll-mt-20 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="related-work-title" className="font-semibold">
            Related work
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={actions.loading}
              onClick={() => void actions.reload()}
            >
              Refresh related work
            </Button>
            <Link className="text-sm text-primary underline" to="/app/playbook">
              All work
            </Link>
          </div>
        </div>
        <p className={small}>
          These tasks include this observation in their supporting scope. Review the brief and
          evidence before acting.
        </p>
        <ErrorNotice error={actions.error} />
        {actions.loading ? (
          <p role="status">Loading related work…</p>
        ) : relatedActions.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {relatedActions.map((action) => (
              <ActionCard key={action.id} action={action} />
            ))}
          </div>
        ) : (
          !actions.error && (
            <Empty>
              No linked task in the currently loaded work. A missing diagnosis does not establish an
              optimisation problem.
            </Empty>
          )
        )}
      </section>
      <section id="owned-page-checks" className={`${box} scroll-mt-20 space-y-3`}>
        <h2 className="font-semibold">Owned page checks</h2>
        <p className={small}>
          Check an observed owned source or the frozen brand homepage. A page response does not
          prove search indexing or a retrieval root cause.
        </p>
        <ErrorNotice error={checks.error} />
        {chosenTarget && (
          <Choice
            label="Page to check"
            value={chosenTarget}
            set={setTarget}
            options={targets.map((value) => ({ value, label: value }))}
          />
        )}
        <Button
          variant="outline"
          disabled={mutation.busy || !chosenTarget || !capabilities.data?.pageChecks.available}
          onClick={() =>
            void mutation.run(async () => {
              await api(`${path}/page-checks`, {
                requestId: crypto.randomUUID(),
                target: chosenTarget,
              });
              await checks.reload();
              await analyses.reload();
            })
          }
        >
          Check owned page
        </Button>
        <p className={small}>
          {!capabilities.data?.pageChecks.available
            ? (capabilities.data?.pageChecks.reason ?? 'Checking page-check availability…')
            : !chosenTarget
              ? 'No observed owned target or configured brand homepage.'
              : 'Consumes processing allowance. Stored checks remain available.'}
        </p>
        {checks.data?.length === 0 && <Empty>No page checks recorded.</Empty>}
        {checks.data?.map((check) => (
          <div key={check.id} className="space-y-2 rounded-lg border p-3 text-sm">
            <SafeSource url={check.target}>{check.target}</SafeSource>
            <p>
              {check.status} · {time(check.checkedAt)} · HTTP {check.httpStatus ?? 'unknown'}
            </p>
            <p className={small}>
              Noindex: {check.noindex === null ? 'unknown' : String(check.noindex)} · Robots:{' '}
              {check.robots ?? 'unknown'} · Canonical: {check.canonical ?? 'unknown'}
            </p>
            {check.finalUrl && <p className="break-all text-xs">Final URL: {check.finalUrl}</p>}
            {check.excerpt && (
              <blockquote className="whitespace-pre-wrap break-words border-l-2 pl-3">
                {check.excerpt}
              </blockquote>
            )}
            {check.reason && <p className={small}>{check.reason}</p>}
          </div>
        ))}
      </section>
    </section>
  );
}
export function GeoDiagnoses() {
  const analyses = useResource<GeoAnalysis[]>('/geo/analyses', analysisPending);
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const search = params.get('q') ?? '';
  const requestedStatus = params.get('status') ?? 'all';
  const requestedType = params.get('type') ?? 'all';
  const statusLabels: Record<string, string> = {
    suspected: 'Possible issue',
    supported: 'Evidence found',
    ruled_out: 'Ruled out',
    unknown: 'Not determined',
    queued: 'Waiting for analysis',
    running: 'Analyzing answer',
    failed: 'Analysis unavailable',
    completed: 'No findings established',
  };
  const status = Object.hasOwn(statusLabels, requestedStatus) ? requestedStatus : 'all';
  const type = Object.hasOwn(findingTitles, requestedType) ? requestedType : 'all';
  const rows = (analyses.data ?? [])
    .flatMap((analysis) => {
      const findings = analysis.diagnoses.length ? analysis.diagnoses : [null];
      return findings.map((finding, index) => {
        const title = finding
          ? findingTitles[finding.type]
          : (statusLabels[analysis.state] ?? 'Review analysis');
        const nextStep = finding
          ? finding.status === 'ruled_out'
            ? 'Review the supporting answer before closing this issue.'
            : (nextCheckLabels[finding.missingChecks[0] ?? ''] ??
              'Review the original answer and supporting sources.')
          : analysis.state === 'completed'
            ? 'Review the saved answer; missing findings do not rule out issues.'
            : analysis.state === 'failed'
              ? 'Open the saved answer to review the analysis failure.'
              : 'You can review the saved answer while analysis is pending.';
        return {
          key: `${analysis.id}-${String(index)}`,
          analysis,
          finding,
          title,
          nextStep,
          status: finding?.status ?? analysis.state,
        };
      });
    })
    .filter(
      (row) =>
        (status === 'all' || row.status === status) &&
        (type === 'all' || row.finding?.type === type) &&
        `${row.title} ${row.finding ? (findingReasons[row.finding.reasonCode] ?? '') : ''} ${row.nextStep}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    );
  const totalPages = Math.max(1, Math.ceil(rows.length / 25));
  const requestedPage = Number(params.get('page') ?? 1);
  const page =
    Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, totalPages) : 1;
  const start = (page - 1) * 25;
  const returnTo = location.pathname + location.search;
  function update(key: string, value: string, replace = false) {
    const next = new URLSearchParams(window.location.search);
    if (!value || value === 'all') next.delete(key);
    else next.set(key, value);
    if (key !== 'page') next.delete('page');
    setExpanded(null);
    setParams(next, { replace });
  }
  const field = 'h-10 min-w-0 max-w-full rounded-lg border bg-card px-2 text-sm';
  const cell = 'min-w-0 break-words px-3 py-2';
  const moreFilters = (
    <>
      <label className="min-w-0">
        <span className="sr-only">Finding status</span>
        <select
          aria-label="Finding status"
          className={field}
          value={status}
          onChange={(event) => {
            update('status', event.target.value);
          }}
        >
          <option value="all">All statuses</option>
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-0">
        <span className="sr-only">Finding type</span>
        <select
          aria-label="Finding type"
          className={field}
          value={type}
          onChange={(event) => {
            update('type', event.target.value);
          }}
        >
          <option value="all">All finding types</option>
          <option value="retrieval_problem">Brand discovery</option>
          <option value="evidence_problem">Product evidence</option>
          <option value="recommendation_fit_problem">Buyer fit</option>
        </select>
      </label>
    </>
  );
  return (
    <section className="space-y-3">
      <WorkspaceHeading title="Diagnoses">
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/app/playbook">
              Action Playbook
              <ArrowRight className="size-3" aria-hidden="true" />
            </Link>
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="icon" variant="ghost" aria-label="About diagnoses">
                <Info className="size-4" aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="workspace-theme text-sm" aria-label="About diagnoses">
              Suggested findings from saved answers need your review. Missing findings do not rule
              out issues, and a saved answer alone does not establish the cause. Filters apply to
              the latest 100 saved analyses loaded here.
            </PopoverContent>
          </Popover>
        </div>
      </WorkspaceHeading>
      <div className="monitoring-toolbar flex flex-wrap items-center gap-2 rounded-t-xl border border-b-0 bg-card p-3">
        <label className="relative min-w-0 flex-1 basis-48">
          <Search
            className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="sr-only">Search diagnoses</span>
          <input
            className={`${field} w-full pl-9`}
            placeholder="Search findings or next steps…"
            maxLength={500}
            value={search}
            onChange={(event) => {
              update('q', event.target.value, true);
            }}
          />
        </label>
        <div className="hidden flex-wrap gap-2 md:flex" aria-label="Diagnosis filters">
          {moreFilters}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="md:hidden">
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              Filters
            </Button>
          </PopoverTrigger>
          <PopoverContent
            aria-label="Diagnosis filters"
            className="workspace-theme grid max-w-[calc(100vw-2rem)] gap-3"
          >
            {moreFilters}
          </PopoverContent>
        </Popover>
        <ControlTooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Refresh saved diagnoses"
              disabled={analyses.loading || refreshing}
              onClick={() => {
                setRefreshing(true);
                void analyses.reload().finally(() => {
                  setRefreshing(false);
                });
              }}
            >
              <RefreshCw
                className={`size-4 ${refreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh saved diagnoses</TooltipContent>
        </ControlTooltip>
      </div>
      <div className="overflow-hidden rounded-b-xl border bg-card">
        {analyses.loading ? (
          <p role="status" className="p-4 text-sm">
            Loading saved diagnoses…
          </p>
        ) : analyses.error || !analyses.data ? (
          <div className="space-y-2 p-4 text-sm">
            <p role="alert">
              Saved diagnoses are unavailable. Refresh saved diagnoses to try again.
            </p>
            <Link className="text-primary underline" to="/app/observations">
              View saved answers
            </Link>
          </div>
        ) : !analyses.data.length ? (
          <div className="p-4">
            <Empty>
              No analysis recorded yet.{' '}
              <Link className="text-primary underline" to="/app/observations">
                View saved answers
              </Link>{' '}
              to review or analyze an answer.
            </Empty>
          </div>
        ) : !rows.length ? (
          <p className="p-5 text-sm text-muted-foreground">No diagnoses match these filters.</p>
        ) : (
          <table className="diagnoses-table w-full table-fixed text-left text-sm">
            <caption className="sr-only">
              Findings and analysis statuses in loaded saved analyses
            </caption>
            <thead className="bg-muted/40">
              <tr>
                <th scope="col" className={`${cell} w-[32%]`}>
                  Finding
                </th>
                <th scope="col" className={`${cell} w-[15%]`}>
                  Status
                </th>
                <th scope="col" className={`${cell} w-[23%]`}>
                  Next step
                </th>
                <th scope="col" className={`${cell} w-[14%]`}>
                  Requested
                </th>
                <th scope="col" className={`${cell} w-[16%]`}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(start, start + 25).map((row) => {
                const Icon =
                  row.finding?.type === 'retrieval_problem'
                    ? Globe
                    : row.finding?.type === 'recommendation_fit_problem'
                      ? Target
                      : FileSearch;
                return (
                  <Fragment key={row.key}>
                    <tr className="border-t align-top hover:bg-muted/10">
                      <th scope="row" className={`${cell} font-normal`}>
                        <div className="flex items-start gap-2">
                          <Icon
                            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <span className="font-medium">{row.title}</span>
                            {row.finding && (
                              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                {findingReasons[row.finding.reasonCode] ??
                                  'Review the original answer and supporting sources to assess this finding.'}
                              </p>
                            )}
                          </div>
                        </div>
                      </th>
                      <td className={cell} data-label="Status">
                        <Badge
                          variant={row.status === 'failed' ? 'warning' : 'outline'}
                          className="max-w-full whitespace-normal text-left"
                        >
                          {statusLabels[row.status]}
                        </Badge>
                        {row.analysis.classification?.scope === 'partial' && (
                          <span className="mt-1 block text-xs text-amber-800">
                            Partial analysis
                          </span>
                        )}
                      </td>
                      <td className={cell} data-label="Next step">
                        {row.nextStep}
                      </td>
                      <td
                        className={`${cell} text-xs text-muted-foreground`}
                        data-label="Requested"
                      >
                        <time dateTime={row.analysis.createdAt}>
                          {time(row.analysis.createdAt)}
                        </time>
                      </td>
                      <td className={cell}>
                        <div className="flex flex-wrap items-center gap-x-3">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="px-0 text-xs"
                            aria-expanded={expanded === row.key}
                            aria-controls={`diagnosis-${encodeURIComponent(row.key)}`}
                            onClick={() => {
                              setExpanded(expanded === row.key ? null : row.key);
                            }}
                          >
                            Details
                          </Button>
                          <Link
                            className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-primary hover:underline"
                            to={`/app/observations/${encodeURIComponent(row.analysis.observationId)}`}
                            state={{ returnTo }}
                          >
                            View answer
                            <ArrowRight className="size-3 shrink-0" aria-hidden="true" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                    {expanded === row.key && (
                      <tr className="diagnosis-detail border-t bg-muted/15">
                        <td
                          colSpan={5}
                          id={`diagnosis-${encodeURIComponent(row.key)}`}
                          className="p-3 sm:p-4"
                        >
                          <AnalysisCard analysis={row.analysis} returnTo={returnTo} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {!analyses.loading && !analyses.error && analyses.data && (
        <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {rows.length ? start + 1 : 0}–{Math.min(start + 25, rows.length)} of {rows.length}{' '}
            results · {analyses.data.length} saved analyses loaded · Review suggested
          </span>
          {totalPages > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => {
                  update('page', String(page - 1));
                }}
              >
                Previous page
              </Button>
              <span>
                Page {page} of {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => {
                  update('page', String(page + 1));
                }}
              >
                Next page
              </Button>
            </div>
          )}
        </footer>
      )}
    </section>
  );
}
const actionCategories = { owned: 'Your website', earned: 'External sources' };
const actionStatuses = {
  proposed: 'Suggested',
  accepted: 'Planned',
  in_progress: 'In progress',
  dismissed: 'Dismissed',
  completed: 'Completed',
};
const actionEvents = {
  accepted: 'Task planned',
  dismissed: 'Task dismissed',
  progress: 'Task updated',
  completed: 'Work completed',
  reopened: 'Task reopened',
};
function ActionCard({ action }: { action: GeoAction }) {
  const copy = actionCopy[action.templateId];
  return (
    <Link
      to={`/app/playbook/${encodeURIComponent(action.id)}`}
      className="block min-w-0 space-y-3 rounded-xl border bg-card p-5 shadow-sm transition-colors hover:border-primary/40"
    >
      <div className="flex flex-wrap gap-2">
        <Badge variant={action.category === 'owned' ? 'secondary' : 'outline'}>
          {actionCategories[action.category]}
        </Badge>
        <Badge variant="outline">{actionStatuses[action.status]}</Badge>
      </div>
      <h3 className="text-sm font-semibold">{action.title}</h3>
      <p className={small}>{copy?.deliverable ?? action.deliverable}</p>
      <p className={small}>Estimated time: {action.effort}</p>
    </Link>
  );
}
export function GeoPlaybook() {
  const actions = useResource<GeoAction[]>('/geo/actions', true);
  const [status, setStatus] = useState('active');
  const visible =
    actions.data?.filter(
      (action) =>
        status === 'all' ||
        (status === 'active'
          ? !['completed', 'dismissed'].includes(action.status)
          : action.status === status),
    ) ?? [];
  const owned = visible.filter((action) => action.category === 'owned').length;
  return (
    <section className="space-y-5">
      <WorkspaceHeading
        title="Action Playbook"
        description="Choose a task, record your work and compare follow-up answers. Results need your review; improvements are not guaranteed."
      />
      <div className="max-w-sm">
        <Choice
          label="Action status"
          value={status}
          set={setStatus}
          options={[
            { value: 'active', label: 'Suggested & active work' },
            { value: 'completed', label: 'Completed' },
            { value: 'dismissed', label: 'Dismissed' },
            { value: 'all', label: 'All actions' },
          ]}
        />
      </div>
      <ErrorNotice error={actions.error} />
      {actions.data && (
        <p className={small}>
          {visible.length} tasks in this view · {owned} for your website · {visible.length - owned}{' '}
          for external sources
        </p>
      )}
      {actions.loading ? (
        <p role="status">Loading tasks…</p>
      ) : actions.error ? (
        <p className="text-sm text-muted-foreground">
          Tasks are unavailable right now. Try refreshing this page.
        </p>
      ) : visible.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((action) => (
            <ActionCard key={action.id} action={action} />
          ))}
        </div>
      ) : (
        <Empty>
          No tasks in this view. Review your saved answers and analysis for possible next steps.
        </Empty>
      )}
    </section>
  );
}
export function GeoActionPage() {
  const { actionId = '' } = useParams();
  return <GeoActionDetailPage key={actionId} actionId={actionId} />;
}
function GeoActionDetailPage({ actionId }: { actionId: string }) {
  const path = `/geo/actions/${encodeURIComponent(actionId)}`;
  const detail = useResource<GeoActionDetail>(path);
  const mutation = useMutation();
  const [notes, setNotes] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [changeUrl, setChangeUrl] = useState('');
  const [implementedAt, setImplementedAt] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [extraEvidence, setExtraEvidence] = useState<GeoActionDetail['evidence']>([]);
  const [evidenceCursor, setEvidenceCursor] = useState<string | null>(null);
  const [measurementRevision, setMeasurementRevision] = useState(0);
  const moreEvidenceCursor = evidenceCursor ?? detail.data?.nextEvidenceCursor;
  const action = detail.data?.action;
  const copy = action && actionCopy[action.templateId];
  const origin = detail.data?.events.find(
    (event) => event.kind === 'accepted' && typeof event.details.sourceActionId === 'string',
  );
  async function patch(values: Pick<GeoActionPatch, 'status' | 'checkedIds' | 'notes'>) {
    if (!action) return;
    await api(
      path,
      { requestId: crypto.randomUUID(), revision: action.revision, ...values },
      'PATCH',
    );
    await detail.reload();
  }
  const promptIds = action
    ? Array.from(new Set(action.scopes.map((scope) => scope.context.promptId)))
    : [];
  const affectedEngines = action
    ? Array.from(new Set(action.scopes.map((scope) => scope.context.engine)))
    : [];
  return (
    <section className="space-y-5">
      <WorkspaceHeading
        title="Action brief"
        description="Review the supporting answers, work through the checklist and record what you changed. Then compare new answers using matching questions and settings."
      >
        <Link className="text-sm text-primary underline" to="/app/playbook">
          All work
        </Link>
      </WorkspaceHeading>
      <ErrorNotice error={detail.error ?? mutation.error} />
      {detail.loading ? (
        <p role="status">Loading task and supporting answers…</p>
      ) : (
        action && (
          <>
            <section className={`${box} space-y-4`}>
              <div className="flex flex-wrap gap-2">
                <Badge>{actionCategories[action.category]}</Badge>
                <Badge variant="outline">{actionStatuses[action.status]}</Badge>
                <Badge variant="warning">Needs review</Badge>
              </div>
              <h2 className="text-xl font-semibold">{action.title}</h2>
              <p className={small}>Estimated time: {action.effort}</p>
              {action.targetUrl ? (
                <SafeSource url={action.targetUrl}>Page to review</SafeSource>
              ) : (
                action.targetDomain && (
                  <p className="break-words text-sm">Website: {action.targetDomain}</p>
                )
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="text-sm font-medium">What to produce</h3>
                  <p className={`mt-1 ${small}`}>{copy?.deliverable ?? action.deliverable}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium">When this task is done</h3>
                  <p className={`mt-1 ${small}`}>{copy?.done ?? action.doneCriteria}</p>
                </div>
              </div>
              <details className="border-t pt-3 text-sm">
                <summary className="cursor-pointer font-medium">Task details</summary>
                <div className={`mt-3 space-y-2 ${small}`}>
                  <p>{action.reason}</p>
                  <p>
                    Priority {action.priority}: {action.priorityReason}
                  </p>
                  <p>
                    Template {action.templateId} · {action.templateVersion} · revision{' '}
                    {action.revision}
                  </p>
                  <p>
                    {action.evidenceCount} supporting records · {action.scopes.length} frozen scopes
                    · category {action.category} · status {action.status}
                  </p>
                  <h3 className="font-medium text-foreground">Original task instructions</h3>
                  <p>{action.deliverable}</p>
                  <p>{action.doneCriteria}</p>
                  <ol className="list-decimal space-y-1 pl-5">
                    {action.checklist.map((step) => (
                      <li key={step.id}>{step.text}</li>
                    ))}
                  </ol>
                </div>
              </details>
              <div className="flex flex-wrap gap-2">
                {['proposed', 'dismissed'].includes(action.status) && (
                  <Button
                    disabled={mutation.busy}
                    onClick={() => void mutation.run(() => patch({ status: 'accepted' }))}
                  >
                    Accept action
                  </Button>
                )}
                {action.category === 'owned' && detail.data && (
                  <GeoFollowUpDialog key={action.id} detail={detail.data} />
                )}
                {action.status !== 'completed' && action.status !== 'dismissed' && (
                  <Button
                    variant="outline"
                    disabled={mutation.busy}
                    onClick={() =>
                      void mutation.run(() =>
                        patch({ status: 'dismissed', notes: notes ?? action.notes }),
                      )
                    }
                  >
                    Dismiss action
                  </Button>
                )}
              </div>
              <fieldset
                disabled={
                  mutation.busy || action.status === 'completed' || action.status === 'dismissed'
                }
                className="space-y-3 border-t pt-4"
              >
                <legend className="text-sm font-medium">Work checklist</legend>
                {action.checklist.map((step) => (
                  <label key={step.id} className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 accent-primary"
                      checked={action.checkedIds.includes(step.id)}
                      onChange={(event) => {
                        const checkedIds = event.target.checked
                          ? [...action.checkedIds, step.id]
                          : action.checkedIds.filter((id) => id !== step.id);
                        void mutation.run(() => patch({ checkedIds, status: 'in_progress' }));
                      }}
                    />
                    <span>{copy?.checklist[step.id] ?? step.text}</span>
                  </label>
                ))}
              </fieldset>
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void mutation.run(async () => {
                    await patch({ notes: notes ?? action.notes });
                    setNotes(null);
                  });
                }}
              >
                <label className="block space-y-2 text-sm">
                  Work notes
                  <Textarea
                    maxLength={2000}
                    value={notes ?? action.notes}
                    disabled={action.status === 'completed' || action.status === 'dismissed'}
                    onChange={(event) => {
                      setNotes(event.target.value);
                    }}
                  />
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    mutation.busy ||
                    notes === null ||
                    action.status === 'completed' ||
                    action.status === 'dismissed'
                  }
                >
                  Save notes
                </Button>
              </form>
            </section>
            {origin && (
              <section className={`${box} space-y-2 text-sm`} aria-label="Follow-up origin">
                <h2 className="font-semibold">Follow-up work</h2>
                <p>Starting answers selected: {origin.scopes.length}</p>
                <p>
                  {typeof origin.details.changeDescription === 'string'
                    ? origin.details.changeDescription
                    : ''}
                </p>
                <Link
                  className="text-primary underline"
                  to={`/app/playbook/${encodeURIComponent(String(origin.details.sourceActionId))}`}
                >
                  Previous task history
                </Link>
              </section>
            )}
            <details className={`${box} space-y-3`}>
              <summary className="cursor-pointer font-semibold">Supporting answers</summary>
              <p className={small}>
                {action.evidenceCount} total records · {action.scopes.length} affected scopes.
                Source co-occurrence is not a proven recommendation cause.
              </p>
              {[...(detail.data?.evidence ?? []), ...extraEvidence].map((evidence, index) => (
                <div
                  key={`${evidence.observationId}-${evidence.analysisId}-${String(index)}`}
                  className="rounded-lg border p-3 text-sm"
                >
                  <p className="whitespace-pre-wrap break-words">
                    {evidence.scope.context.promptText}
                  </p>
                  <p className={small}>
                    {geoSurfaces[evidence.scope.context.engine].label} ·{' '}
                    {time(evidence.scope.capturedAt)} · prompt version{' '}
                    {evidence.scope.context.promptVersionId}
                  </p>
                  <p className={small}>
                    Analysis {evidence.analysisId} · evidence IDs{' '}
                    {evidence.evidenceIds.join(', ') || 'Scope association only'}
                  </p>
                  <Link
                    className="mt-2 inline-block text-xs text-primary underline"
                    to={`/app/observations/${encodeURIComponent(evidence.observationId)}`}
                  >
                    View original answer and sources
                  </Link>
                </div>
              ))}
              {moreEvidenceCursor && (
                <Button
                  variant="outline"
                  disabled={mutation.busy}
                  onClick={() =>
                    void mutation.run(async () => {
                      const next = await api<GeoActionDetail>(
                        `${path}?cursor=${encodeURIComponent(moreEvidenceCursor)}`,
                      );
                      setExtraEvidence((previous) => [...previous, ...next.evidence]);
                      setEvidenceCursor(next.nextEvidenceCursor ?? '');
                    })
                  }
                >
                  More supporting evidence
                </Button>
              )}
            </details>
            {action.status !== 'completed' && action.status !== 'dismissed' && (
              <form
                className={`${box} space-y-4`}
                onSubmit={(event) => {
                  event.preventDefault();
                  void mutation.run(async () => {
                    await api(`${path}/complete`, {
                      requestId: crypto.randomUUID(),
                      revision: action.revision,
                      changeDescription: description,
                      implementedAt: new Date(implementedAt).toISOString(),
                      ...(changeUrl ? { changeUrl } : {}),
                    });
                    setDescription('');
                    setChangeUrl('');
                    setImplementedAt('');
                    await detail.reload();
                  });
                }}
              >
                <h2 className="font-semibold">Record your work</h2>
                <label className="block space-y-2 text-sm">
                  Change description
                  <Textarea
                    required
                    minLength={5}
                    maxLength={2000}
                    value={description}
                    onChange={(event) => {
                      setDescription(event.target.value);
                    }}
                  />
                </label>
                <label className="block space-y-2 text-sm">
                  Change URL (optional)
                  <Input
                    type="url"
                    placeholder="https://…"
                    maxLength={2000}
                    value={changeUrl}
                    onChange={(event) => {
                      setChangeUrl(event.target.value);
                    }}
                  />
                </label>
                <label className="block space-y-2 text-sm">
                  When was the work completed?
                  <Input
                    required
                    type="datetime-local"
                    value={implementedAt}
                    onChange={(event) => {
                      setImplementedAt(event.target.value);
                    }}
                  />
                </label>
                <p className={small}>
                  This time uses your local timezone. Completing the task saves a record of your
                  work; it does not run monitoring.
                </p>
                <Button disabled={mutation.busy}>Complete action</Button>
              </form>
            )}
            {action.status === 'completed' && (
              <form
                className={`${box} space-y-3`}
                onSubmit={(event) => {
                  event.preventDefault();
                  void mutation.run(async () => {
                    await api(`${path}/reopen`, {
                      requestId: crypto.randomUUID(),
                      revision: action.revision,
                      reason: reopenReason,
                    });
                    setReopenReason('');
                    await detail.reload();
                  });
                }}
              >
                <h2 className="font-semibold">Reopen work</h2>
                <label className="block space-y-2 text-sm">
                  Reason for reopening
                  <Textarea
                    required
                    minLength={3}
                    maxLength={1000}
                    value={reopenReason}
                    onChange={(event) => {
                      setReopenReason(event.target.value);
                    }}
                  />
                </label>
                <p className={small}>
                  Your previous completion, changes and notes stay in the work history.
                </p>
                <Button variant="outline" disabled={mutation.busy}>
                  Reopen action
                </Button>
              </form>
            )}
            <section className={`${box} space-y-3`}>
              <h2 className="font-semibold">Follow-up measurement</h2>
              <p className={small}>
                Compare answers from before and after your work. New monitoring uses your current
                questions and settings; changes to either can prevent a direct comparison.
                Completing a task does not collect a new answer or prove an improvement.
              </p>
              <GeoMonitor
                promptIds={promptIds}
                selectedEngines={affectedEngines}
                onComplete={() => {
                  setMeasurementRevision((value) => value + 1);
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setMeasurementRevision((value) => value + 1);
                }}
              >
                Refresh saved measurements
              </Button>
              <PinMeasurements
                key={`${action.id}-${String(action.revision)}-${String(measurementRevision)}`}
                action={action}
                days={36500}
              />
            </section>
            <section className={`${box} space-y-3`}>
              <h2 className="font-semibold">Work history</h2>
              {detail.data?.events.map((event) => (
                <div key={event.id} className="rounded-lg border p-3">
                  <p className="text-sm font-medium">
                    {actionEvents[event.kind]} · {time(event.recordedAt)}
                  </p>
                  {typeof event.details.changeDescription === 'string' && (
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                      {event.details.changeDescription}
                    </p>
                  )}
                  {typeof event.details.reason === 'string' && (
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                      {event.details.reason}
                    </p>
                  )}
                  {typeof event.details.notes === 'string' && (
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                      {event.details.notes || 'Notes cleared.'}
                    </p>
                  )}
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium">Event details</summary>
                    <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                      {JSON.stringify(event.details, null, 2)}
                    </pre>
                    <p className={small}>
                      {event.scopes.length} frozen scopes · {event.evidenceIds.length} evidence
                      records
                    </p>
                  </details>
                </div>
              ))}
            </section>
          </>
        )
      )}
    </section>
  );
}
export function GeoCompetitors() {
  const { data } = useOutletContext<WorkspaceContext>();
  const filter = useEvidenceFilter();
  const cursor = filter.params.get('cursor');
  const search = filter.params.get('q') ?? '';
  const observations = useResource<GeoObservationPage>(
    `/geo/observations?${filter.query}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
  );
  const analyses = useResource<GeoAnalysis[]>('/geo/analyses');
  const [refreshing, setRefreshing] = useState(false);
  const loading = observations.loading || analyses.loading;
  const unavailable =
    observations.error !== null || analyses.error !== null || !observations.data || !analyses.data;
  const classified =
    observations.data?.observations.flatMap((observation) => {
      const analysis = analyses.data?.find(
        (row) => row.observationId === observation.id && row.state === 'completed',
      );
      return analysis?.classification
        ? [{ observation, classification: analysis.classification }]
        : [];
    }) ?? [];
  const comparisons = classified.filter(({ observation }) =>
    [
      observation.context.promptText,
      observation.context.brand.name,
      ...observation.context.competitors.map(
        (competitor) => `${competitor.name} ${competitor.domain ?? ''}`,
      ),
    ]
      .join(' ')
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const stanceLabels: Record<string, string> = {
    recommended: 'Recommended',
    conditional_recommendation: 'Recommended with conditions',
    neutral_mention: 'Mentioned',
    discouraged: 'Not recommended',
    not_applicable: 'No recommendation',
    unknown: 'Unclear',
  };
  function update(key: string, value: string, replace = false) {
    const next = new URLSearchParams(window.location.search);
    if (!value || value === 'all') next.delete(key);
    else next.set(key, value);
    if (key !== 'cursor' && key !== 'q') next.delete('cursor');
    filter.setParams(next, { replace });
  }
  const field = 'h-10 min-w-0 max-w-full rounded-lg border bg-card px-2 text-sm';
  const cell = 'min-w-0 break-words px-3 py-2';
  const moreFilters = (
    <>
      <label className="min-w-0">
        <span className="sr-only">Engine</span>
        <select
          aria-label="Engine"
          className={field}
          value={filter.engine ?? 'all'}
          onChange={(event) => {
            update('engine', event.target.value);
          }}
        >
          <option value="all">All engines</option>
          {engines.map((engine) => (
            <option key={engine} value={engine}>
              {geoSurfaces[engine].label}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-0">
        <span className="sr-only">Prompt</span>
        <select
          aria-label="Prompt"
          className={`${field} md:max-w-56`}
          value={filter.promptId || 'all'}
          onChange={(event) => {
            update('promptId', event.target.value);
          }}
        >
          <option value="all">All prompts</option>
          {data.project?.questions.map((prompt) => (
            <option key={prompt.id} value={prompt.id}>
              {prompt.text}
            </option>
          ))}
        </select>
      </label>
    </>
  );
  return (
    <section className="space-y-3">
      <WorkspaceHeading title="Competitors">
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/app/settings#brand-context">Manage competitors</Link>
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="About competitor comparisons">
                <Info className="size-4" aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="workspace-theme text-sm"
              aria-label="About competitor comparisons"
            >
              Compare your brand and competitors within each saved answer. AI analysis needs review;
              a mention is not a recommendation. Comparisons use the brand context saved with each
              answer and do not establish rankings, market share or displacement.
            </PopoverContent>
          </Popover>
        </div>
      </WorkspaceHeading>
      <div className="monitoring-toolbar flex flex-wrap items-center gap-2 rounded-t-xl border border-b-0 bg-card p-3">
        <label className="relative min-w-0 flex-1 basis-48">
          <Search
            className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="sr-only">Search comparisons</span>
          <input
            className={`${field} w-full pl-9`}
            placeholder="Search loaded prompts or competitors…"
            value={search}
            maxLength={500}
            onChange={(event) => {
              update('q', event.target.value, true);
            }}
          />
        </label>
        <label>
          <span className="sr-only">Period</span>
          <select
            aria-label="Period"
            className={field}
            value={filter.days}
            onChange={(event) => {
              update('days', event.target.value);
            }}
          >
            {['7', '14', '30'].map((days) => (
              <option key={days} value={days}>
                Last {days} days
              </option>
            ))}
          </select>
        </label>
        <div aria-label="Competitor filters" className="hidden flex-wrap gap-2 md:flex">
          {moreFilters}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="md:hidden">
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              Filters
            </Button>
          </PopoverTrigger>
          <PopoverContent
            aria-label="Competitor filters"
            className="workspace-theme grid max-w-[calc(100vw-2rem)] gap-3"
          >
            {moreFilters}
          </PopoverContent>
        </Popover>
        <ControlTooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refresh saved comparisons"
              disabled={loading || refreshing}
              onClick={() => {
                setRefreshing(true);
                void Promise.all([observations.reload(), analyses.reload()]).finally(() => {
                  setRefreshing(false);
                });
              }}
            >
              <RefreshCw
                className={`size-4 ${refreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh saved comparisons</TooltipContent>
        </ControlTooltip>
      </div>
      <div className="overflow-hidden rounded-b-xl border bg-card">
        {loading ? (
          <p role="status" className="p-4 text-sm">
            Loading competitor comparisons…
          </p>
        ) : unavailable ? (
          <div className="space-y-2 p-4 text-sm">
            <p role="alert">
              Competitor comparisons are unavailable. Refresh saved comparisons to try again.
            </p>
            <Link className="text-primary underline" to={`/app/observations?${filter.query}`}>
              View saved answers
            </Link>
          </div>
        ) : !observations.data?.observations.length ? (
          <div className="p-4">
            <Empty>No saved answers in this period and scope.</Empty>
          </div>
        ) : !classified.length ? (
          <div className="p-4">
            <Empty>
              No analyzed competitor comparisons in this scope yet. Visibility is unknown until
              eligible evidence is available.{' '}
              <Link className="text-primary underline" to={`/app/observations?${filter.query}`}>
                View saved answers
              </Link>
            </Empty>
          </div>
        ) : !comparisons.length ? (
          <p className="p-5 text-sm text-muted-foreground">
            No comparisons on this page match your search.
          </p>
        ) : (
          <table className="competitors-table w-full table-fixed text-left text-sm">
            <caption className="sr-only">Competitor comparisons in loaded analyzed answers</caption>
            <thead className="bg-muted/40">
              <tr>
                <th scope="col" className={`${cell} w-[30%]`}>
                  Prompt
                </th>
                <th scope="col" className={`${cell} w-[18%]`}>
                  Your brand
                </th>
                <th scope="col" className={`${cell} w-[24%]`}>
                  Competitors
                </th>
                <th scope="col" className={`${cell} w-[17%]`}>
                  Engine &amp; captured
                </th>
                <th scope="col" className={`${cell} w-[11%]`}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map(({ observation, classification }) => (
                <tr key={observation.id} className="border-t align-top hover:bg-muted/10">
                  <th scope="row" className={`${cell} font-normal`}>
                    {observation.context.promptText}
                  </th>
                  <td className={cell} data-label="Your brand">
                    <span className="mb-1 block font-medium">{observation.context.brand.name}</span>
                    <Badge variant="outline" className="max-w-full whitespace-normal text-left">
                      {classification.brandStance === 'not_applicable'
                        ? analysisLabels[classification.brandPresence]
                        : stanceLabels[classification.brandStance]}
                    </Badge>
                  </td>
                  <td className={cell} data-label="Competitors">
                    {observation.context.competitors.length ? (
                      <ul className="space-y-2">
                        {observation.context.competitors.map((competitor) => (
                          <li key={competitor.id} className="min-w-0">
                            <span className="line-clamp-2 font-medium" title={competitor.name}>
                              {competitor.name}
                            </span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {stanceLabels[
                                classification.competitors.find((row) => row.id === competitor.id)
                                  ?.stance ?? 'unknown'
                              ] ?? 'Unclear'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        No competitors in this saved answer's context
                      </span>
                    )}
                  </td>
                  <td className={cell} data-label="Engine & captured">
                    <span className="flex items-start gap-2 text-xs">
                      <EngineIcon engine={observation.engine} />
                      {geoSurfaces[observation.engine].label}
                    </span>
                    <time
                      dateTime={observation.capturedAt}
                      className="mt-1 block text-xs text-muted-foreground"
                    >
                      {time(observation.capturedAt)}
                    </time>
                    {(observation.capture.quality !== 'complete' ||
                      classification.scope === 'partial') && (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {observation.capture.quality === 'no_feature'
                          ? 'No AI answer'
                          : 'Partial evidence'}
                      </span>
                    )}
                  </td>
                  <td className={cell}>
                    <div className="flex flex-wrap items-center gap-x-3">
                      <Link
                        className="inline-flex min-h-8 items-center gap-1 text-xs font-medium text-primary hover:underline"
                        to={`/app/observations/${encodeURIComponent(observation.id)}?${answerQuery(filter.params)}`}
                        state={{
                          returnTo: `/app/competitors${filter.params.size ? `?${filter.params}` : ''}`,
                        }}
                      >
                        View answer
                        <ArrowRight className="size-3 shrink-0" aria-hidden="true" />
                      </Link>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="mt-1 px-0 text-xs text-muted-foreground"
                            aria-label={`Comparison details: ${observation.context.promptText}`}
                          >
                            Details
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          aria-label="Comparison details"
                          className="workspace-theme max-w-[calc(100vw-2rem)] space-y-2 break-words text-xs"
                        >
                          <p>
                            AI analysis · Needs review. A competitor appearing here does not
                            establish displacement.
                          </p>
                          <p>
                            Your brand: {analysisLabels[classification.brandPresence]} ·{' '}
                            {analysisLabels[classification.brandStance]}
                          </p>
                          <p>
                            Context version {observation.context.contextVersion} ·{' '}
                            {classification.scope} analysis
                          </p>
                          <ul>
                            {observation.context.competitors.map((competitor) => (
                              <li key={competitor.id}>
                                {competitor.name}: {competitor.domain ?? 'Domain not configured'}
                              </li>
                            ))}
                          </ul>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {!loading && !unavailable && (
        <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {comparisons.length} shown · {classified.length} of{' '}
            {observations.data?.observations.length} loaded captures analyzed · Review suggested
          </span>
          <div className="flex flex-wrap gap-2">
            {cursor && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  update('cursor', '');
                }}
              >
                First page
              </Button>
            )}
            {observations.data?.nextCursor && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  update('cursor', observations.data?.nextCursor ?? '');
                }}
              >
                Older answers
              </Button>
            )}
          </div>
        </footer>
      )}
    </section>
  );
}
export function GeoBilling() {
  const { data } = useOutletContext<WorkspaceContext>();
  const billing = useResource<Billing>('/api/billing/status');
  const [params] = useSearchParams();
  const mutation = useMutation();
  const allowance = useResource<GeoAllowance>(data.project ? '/geo/allowance' : null);
  const supportRequired = supportReasons.has(allowance.data?.reason ?? '');
  return (
    <section className="space-y-5">
      <WorkspaceHeading
        title="Billing & usage"
        description="Your subscription, monitoring usage and available checks."
      >
        {data.project ? (
          <Button asChild variant="outline" size="sm">
            <Link to="/app/settings#subscription">Manage subscription</Link>
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={!billing.data?.portalAvailable || mutation.busy || fixtureMode().requested}
            onClick={() => {
              void mutation.run(async () => {
                const result = await api<{ url: string }>('/api/billing/portal', {});
                const url = new URL(result.url);
                if (url.protocol !== 'https:') throw new Error('Invalid billing URL.');
                window.location.assign(url.href);
              });
            }}
          >
            Manage subscription
          </Button>
        )}
      </WorkspaceHeading>
      <ErrorNotice error={billing.error ?? allowance.error ?? mutation.error} />
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_1.5fr]">
        <section className={box} aria-label="Current subscription">
          <p className={small}>Current subscription</p>
          {billing.loading ? (
            <p role="status" className="mt-3 text-sm">
              Loading subscription…
            </p>
          ) : billing.data ? (
            <>
              <h2 className="mt-3 text-xl font-semibold capitalize">
                {billing.data.subscription
                  ? words(billing.data.subscription.status)
                  : 'No subscription'}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {billing.data.subscription
                  ? subscriptionLabel(billing.data.plan)
                  : 'Review subscription options in Settings. Saved answers remain available.'}
              </p>
              {billing.data.subscription?.endsAt && (
                <p className="mt-3 text-sm">
                  Current period ends {time(billing.data.subscription.endsAt)}.
                </p>
              )}
              {billing.data.subscription?.testMode && (
                <p className="mt-3 text-sm">Test-mode billing</p>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">Subscription status unavailable.</p>
          )}
        </section>
        <section className={box} aria-label="Monitoring usage">
          <h2 className="font-semibold">Monitoring usage</h2>
          {!data.project ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Complete project setup to see monitoring usage.
            </p>
          ) : allowance.loading ? (
            <p role="status" className="mt-4 text-sm">
              Loading monitoring usage…
            </p>
          ) : allowance.data ? (
            <>
              <dl className="mt-4 grid gap-5 sm:grid-cols-2">
                <div>
                  <dt className={small}>Monitoring attempts today</dt>
                  <dd className="mt-2 text-2xl font-semibold tabular-nums">
                    {allowance.data.today}{' '}
                    <span className="text-base font-normal text-muted-foreground">
                      / {allowance.data.limits.projectDaily}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className={small}>Monitoring attempts this month</dt>
                  <dd className="mt-2 text-2xl font-semibold tabular-nums">
                    {allowance.data.month}{' '}
                    <span className="text-base font-normal text-muted-foreground">
                      / {allowance.data.limits.projectMonthly}
                    </span>
                  </dd>
                </div>
              </dl>
              <p className={`mt-4 ${small}`}>
                Daily and calendar-month limits reset at midnight UTC.
              </p>
              <details className="mt-4">
                <summary className="cursor-pointer text-xs font-medium">
                  How usage is counted
                </summary>
                <p className={`mt-2 ${small}`}>
                  One check is one prompt on one engine. Manual and scheduled checks share your
                  daily allowance. Requests that were sent or have an uncertain result still count;
                  a failure before dispatch releases its reservation. Reading saved evidence does
                  not use checks.
                </p>
              </details>
              <div className="mt-4 rounded-lg border bg-muted/30 p-3 text-sm" role="status">
                {allowance.data.enabled
                  ? 'Manual checks are available within your monitoring limits.'
                  : allowanceReason(allowance.data.reason)}
                {supportRequired && (
                  <a
                    className="mt-2 block font-medium text-primary underline"
                    href={`mailto:${data.supportEmail}`}
                  >
                    Contact support about monitoring
                  </a>
                )}
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Monitoring usage unavailable.</p>
          )}
        </section>
      </div>
      {billing.data?.availabilityMessage && (
        <p role="status" className={small}>
          {billing.data.availabilityMessage}
        </p>
      )}
      {!billing.loading &&
        !billing.error &&
        billing.data &&
        (!billing.data.subscription ||
          billing.data.checkoutOptions?.some((option) => option.available)) && (
          <PricingPlans
            initialInterval={billingSelection(params)?.interval}
            billing={billing.data}
            busy={mutation.busy}
            onCheckout={(selection) => {
              void mutation.run(async () => {
                const result = await api<{ url: string }>('/api/billing/checkout', selection);
                const url = new URL(result.url);
                if (url.protocol !== 'https:') throw new Error('Invalid billing URL.');
                window.location.assign(url.href);
              });
            }}
          />
        )}
      {billing.data?.plan?.id === 'legacy_perplexity' && (
        <details className={`${box} space-y-3`} aria-label="Perplexity plan usage">
          <summary className="cursor-pointer font-semibold">Perplexity plan usage</summary>
          <p className={small}>
            This allowance is separate from the multi-engine monitoring limits above.
          </p>
          <p className="text-sm tabular-nums">
            {data.usage.today} / {data.usage.dailyLimit} attempts today · {data.usage.month} /{' '}
            {data.usage.monthlyLimit} this month
          </p>
          <p className={small}>
            Daily allowance resets {time(data.usage.resetAt)}. Monthly allowance resets{' '}
            {time(data.usage.monthlyResetAt)} (UTC boundaries).
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/app/settings#subscription">Review plan & account</Link>
          </Button>
        </details>
      )}
    </section>
  );
}
export function GeoSettingsPanel({ onReady }: { onReady: (ready: boolean) => void }) {
  const { data: workspace } = useOutletContext<WorkspaceContext>();
  const settings = useResource<GeoSettings>('/geo/settings');
  const capabilities = useResource<GeoCapabilities>('/geo/capabilities');
  useEffect(() => {
    onReady(!settings.loading && !capabilities.loading);
  }, [settings.loading, capabilities.loading, onReady]);
  const mutation = useMutation();
  const [draft, setDraft] = useState<GeoSettingsInput | null>(null);
  const [saved, setSaved] = useState(false);
  const value = draft ?? (settings.data?.engines ? settings.data : null);
  const selectedUnavailable =
    value?.engines.filter((engine) => !capabilities.data?.engines[engine]?.available) ?? [];
  return (
    <section id="monitoring" className={`${box} scroll-mt-20 space-y-4`}>
      <h2 className="text-lg font-medium">Monitoring configuration</h2>
      <p className="text-sm text-muted-foreground">
        Choose your engines, market and schedule. Availability and allowance are checked separately.
      </p>
      <ErrorNotice error={settings.error ?? capabilities.error ?? mutation.error} />
      {settings.loading || capabilities.loading ? (
        <p role="status">Loading engine availability…</p>
      ) : (
        value && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void mutation.run(async () => {
                await api(
                  '/geo/settings',
                  {
                    engines: value.engines,
                    dailyEnabled: value.dailyEnabled,
                    languageCode: value.languageCode,
                    locationCode: value.locationCode,
                    device: value.device,
                  },
                  'PUT',
                );
                setDraft(null);
                setSaved(true);
                await settings.reload();
              });
            }}
          >
            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-medium">Selected AI answer engines</legend>
              <p className={small}>{value.engines.length} of 4 engine slots selected.</p>
              <div className="grid gap-3 md:grid-cols-2">
                {engines
                  .filter(
                    (engine) =>
                      engine !== 'claude_web_search' ||
                      capabilities.data?.engines[engine]?.enabled === true,
                  )
                  .map((engine) => {
                    const capability = capabilities.data?.engines[engine];
                    return (
                      <label
                        key={engine}
                        className={`flex items-start gap-3 rounded-lg border p-4 ${value.engines.includes(engine) ? 'border-primary/30 bg-primary/5' : ''}`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 size-4 shrink-0 accent-primary"
                          aria-label={geoSurfaces[engine].label}
                          checked={value.engines.includes(engine)}
                          disabled={
                            !value.engines.includes(engine) &&
                            (!capability?.available ||
                              value.engines.length >= 4 ||
                              Boolean(workspace.plan && !workspace.plan.engines.includes(engine)))
                          }
                          onChange={(event) => {
                            setSaved(false);
                            setDraft({
                              ...value,
                              engines: event.target.checked
                                ? [...value.engines, engine]
                                : value.engines.filter((item) => item !== engine),
                            });
                          }}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">
                            {geoSurfaces[engine].label}
                          </span>
                          <span className={`block ${small}`}>
                            {capability?.available
                              ? workspace.plan && !workspace.plan.engines.includes(engine)
                                ? 'Outside your current plan'
                                : 'Available for monitoring'
                              : 'Currently unavailable'}
                          </span>
                        </span>
                      </label>
                    );
                  })}
              </div>
            </fieldset>
            <p className={small}>
              Unavailable engines cannot be newly selected. Choose another engine or contact
              support; saved answers remain available.
            </p>
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">How engine monitoring works</summary>
              <p className={`mt-2 ${small}`}>
                Answers are captured through each engine's API and may differ from its consumer app.
                Prompts are sent without hidden brand or competitor hints. Model and capture details
                remain available with each saved answer.
              </p>
            </details>
            {selectedUnavailable.length > 0 && (
              <Empty>
                Selected but unavailable:{' '}
                {selectedUnavailable.map((engine) => geoSurfaces[engine].label).join(', ')}. Remove
                unavailable engines before enabling daily checks, or save with daily monitoring
                disabled; historical captures stay unchanged.
              </Empty>
            )}
            <label className="flex items-start gap-3 rounded-lg border bg-muted/20 p-4 text-sm">
              <input
                type="checkbox"
                className="mt-1 size-4 shrink-0 accent-primary"
                checked={value.dailyEnabled}
                onChange={(event) => {
                  setSaved(false);
                  setDraft({ ...value, dailyEnabled: event.target.checked });
                }}
              />
              <span>
                Enable daily monitoring
                <span className={`mt-1 block ${small}`}>
                  Runs daily within your monitoring access and usage limits. Manual checks remain
                  available independently.
                </span>
              </span>
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <Choice
                label="Language"
                value={value.languageCode}
                set={(languageCode) => {
                  setSaved(false);
                  setDraft({ ...value, languageCode });
                }}
                options={[
                  { value: 'en', label: 'English (en)' },
                  ...(value.languageCode === 'en'
                    ? []
                    : [
                        {
                          value: value.languageCode,
                          label: `Saved language (${value.languageCode})`,
                        },
                      ]),
                ]}
              />
              <Choice
                label="Market"
                value={String(value.locationCode)}
                set={(locationCode) => {
                  setSaved(false);
                  setDraft({ ...value, locationCode: Number(locationCode) });
                }}
                options={[
                  { value: '2840', label: 'United States (US)' },
                  ...(value.locationCode === 2840
                    ? []
                    : [
                        {
                          value: String(value.locationCode),
                          label: `Saved market (${String(value.locationCode)})`,
                        },
                      ]),
                ]}
              />
              <Choice
                label="Device"
                value={value.device}
                set={(device) => {
                  setSaved(false);
                  setDraft({ ...value, device: device as 'desktop' | 'mobile' });
                }}
                options={[
                  { value: 'desktop', label: 'Desktop' },
                  { value: 'mobile', label: 'Mobile' },
                ]}
              />
            </div>
            <p className={small}>
              Language, market and device apply only to engines that support them. Changes start a
              new comparison baseline.
            </p>
            <Button
              disabled={
                mutation.busy ||
                !value.engines.length ||
                value.engines.length > 4 ||
                (value.dailyEnabled && selectedUnavailable.length > 0) ||
                !capabilities.data
              }
            >
              {mutation.busy ? 'Saving…' : 'Save monitoring settings'}
            </Button>
            {saved && (
              <p role="status" className="text-sm">
                Monitoring configuration saved.
              </p>
            )}
          </form>
        )
      )}
      <p className={small}>
        {capabilities.loading
          ? 'Checking answer analysis availability…'
          : capabilities.data?.classifier.available
            ? 'Answer analysis is available. Review suggested findings against the original answer.'
            : 'Answer analysis is currently unavailable. Saved answers remain readable.'}
      </p>
      <Link className="text-xs text-primary underline" to="/app/billing">
        Review monitoring usage
      </Link>
    </section>
  );
}

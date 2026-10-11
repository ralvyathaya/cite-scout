import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useOutletContext, useParams, useSearchParams } from 'react-router';
import { ArrowRight, FileSearch, RefreshCw, MapPin, ExternalLink } from 'lucide-react';
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
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { api, useResource } from './api';
import type { WorkspaceContext } from './Workspace';
import {
  geoSurfaces,
  type GeoAllowance,
  type GeoEngine,
  type GeoObservation,
  type GeoObservationPage,
  type GeoPromptSet,
  type GeoRun,
  type GeoSettings,
  type GeoSettingsInput,
} from '../../../shared/geo';
import type { DecisionModel, GeoAnalysis, GeoPageCheck } from '../../../shared/geo-analysis';
import type {
  GeoAction,
  GeoActionDetail,
  GeoActionPatch,
  GeoSourceOpportunity,
} from '../../../shared/geo-actions';
import type { GeoDailySample, GeoMetric, GeoPinMeasurement } from '../../../shared/geo-measurement';

const box = 'rounded-xl border bg-card p-5 shadow-sm';
const small = 'text-xs leading-relaxed text-muted-foreground';
const engines = Object.keys(geoSurfaces) as GeoEngine[];
const time = (value: string | null) =>
  value
    ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : 'Not reported';
const words = (value: string) => value.replaceAll('_', ' ');
const allowanceReasons: Record<string, string> = {
  GEO_SCANS_DISABLED: 'New GEO checks are paused. Saved answers remain readable.',
  PAID_ACCESS_REQUIRED:
    'A paid subscription is required for fresh GEO checks. Review Billing & usage.',
  PAID_STARTS_NEXT_UTC_DAY:
    'Paid monitoring starts next UTC day. Your frozen trial follow-up remains available.',
  GEO_BUDGET_REQUIRED:
    'The operator must configure a positive monitoring budget before new checks can start.',
  GEO_QUOTA_EXCEEDED: 'Monitoring allowance reached. Review Usage or wait for the UTC reset.',
};
const allowanceReason = (reason: string | null | undefined) =>
  reason
    ? (allowanceReasons[reason] ?? reason)
    : 'New checks are unavailable. Saved evidence remains readable.';
export interface GeoCapabilities {
  engines: Record<GeoEngine, { available: boolean; reason: string | null }>;
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
  return error ? (
    <p
      role="alert"
      className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
    >
      {error.message}
    </p>
  ) : null;
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border bg-muted/25 p-4 text-sm text-muted-foreground">{children}</p>
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
        <SelectContent className="max-w-[calc(100vw-2rem)]">
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
      className="grid gap-3 rounded-xl border bg-muted/15 p-4 sm:grid-cols-3"
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
    <p className={small}>
      {data.project?.brandName} · Last {filter.days} days ·{' '}
      {filter.engine ? geoSurfaces[filter.engine].label : 'All engines'} ·{' '}
      {filter.promptId ? 'Selected prompt' : 'All prompt versions'} · UTC daily samples
    </p>
  );
}
const pendingRun = (run: GeoRun) =>
  run.items.some((item) => ['pending', 'submitting', 'submitted'].includes(item.status));
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
            {run.data.items.length} answers captured · {run.data.status}
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
                {!['succeeded', 'failed', 'cancelled'].includes(item.status) && (
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
}: {
  promptIds?: string[];
  selectedEngines?: GeoEngine[];
  onComplete?: () => void;
}) {
  const { data } = useOutletContext<WorkspaceContext>();
  const settings = useResource<GeoSettings>('/geo/settings');
  const allowance = useResource<GeoAllowance>('/geo/allowance');
  const capabilities = useResource<GeoCapabilities>('/geo/capabilities');
  const mutation = useMutation();
  const [params, setParams] = useSearchParams();
  const scopeEngines = selectedEngines ?? settings.data?.engines ?? [];
  const unavailable = scopeEngines.find((engine) => !capabilities.data?.engines[engine].available);
  const unselected = scopeEngines.find((engine) => !settings.data?.engines.includes(engine));
  const active = data.project?.questions.filter((q) => q.enabled && !q.archivedAt) ?? [];
  const reason =
    settings.loading || allowance.loading || capabilities.loading
      ? 'Checking monitoring availability…'
      : (settings.error?.message ??
        allowance.error?.message ??
        capabilities.error?.message ??
        (!settings.data?.configured
          ? 'Save monitoring engines and configuration in Settings.'
          : !allowance.data?.enabled
            ? allowanceReason(allowance.data?.reason)
            : !scopeEngines.length
              ? 'Choose at least one configured engine.'
              : unselected
                ? `${geoSurfaces[unselected].label} is not selected in current monitoring settings.`
                : unavailable
                  ? (capabilities.data?.engines[unavailable].reason ??
                    `${geoSurfaces[unavailable].label} is unavailable.`)
                  : promptIds?.some((id) => !active.some((prompt) => prompt.id === id))
                    ? 'This scope includes an inactive or historical prompt. Choose active prompts for a fresh check.'
                    : !(promptIds?.length ?? active.length)
                      ? 'Add an active prompt before monitoring.'
                      : null));
  const runId = params.get('geoRun');
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-4">
        <div className="max-w-lg space-y-2">
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
              })
            }
          >
            <RefreshCw
              className={`size-4 ${mutation.busy ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {mutation.busy ? 'Requesting check…' : 'Monitor Prompts'}
          </Button>
          <p id="geo-monitor-status" className={small}>
            {reason ??
              `Fresh check · ${scopeEngines.map((engine) => geoSurfaces[engine].label).join(', ')} · five-minute prompt/engine cooldown`}
          </p>
        </div>
        <div className={`ml-auto ${small}`}>
          {allowance.data && (
            <>
              {allowance.data.today} / {allowance.data.limits.projectDaily} attempts today
              <br />
              {allowance.data.month} / {allowance.data.limits.projectMonthly} this month
            </>
          )}
        </div>
      </div>
      <ErrorNotice error={mutation.error} />
      {runId && (
        <GeoRunProgress
          key={runId}
          id={runId}
          onComplete={() => {
            void allowance.reload();
            onComplete?.();
          }}
        />
      )}
    </div>
  );
}
function SafeSource({ url, children }: { url: string; children: ReactNode }) {
  let safe = false;
  try {
    const parsed = new URL(url);
    safe = ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch {
    /* Provider text remains readable when its URL is invalid. */
  }
  return safe ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="break-words text-primary underline underline-offset-4"
    >
      {children}
      <ExternalLink className="ml-1 inline size-3" aria-hidden="true" />
    </a>
  ) : (
    <span className="break-words">{children} · invalid source URL</span>
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
  const excerpt = capture.answerText.slice(0, 600);
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
    <section className={`${box} min-w-0 space-y-4`} aria-label="Original observation evidence">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <FileSearch className="size-4 text-primary" aria-hidden="true" />
          Original answer evidence
        </h2>
        <Badge variant="outline">{words(capture.quality)}</Badge>
      </div>
      <div className="rounded-lg border bg-muted/20 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Prompt sent to provider
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm">{context.promptText}</p>
        <p className={`mt-3 ${small}`}>
          {geoSurfaces[observation.engine].label} · requested{' '}
          {run.loading ? 'loading…' : run.data ? time(run.data.createdAt) : 'time unavailable'} ·
          captured {time(observation.capturedAt)}
        </p>
        <p className={small}>
          Surface: {words(context.surface)} · Collector: {words(context.collector)} · Model:{' '}
          {capture.modelReported
            ? (capture.model ?? 'Missing model metadata')
            : 'Not reported by this surface'}
        </p>
      </div>
      {run.error && (
        <p className={small}>
          Run provenance could not load: {run.error.message} Original capture remains readable;
          request time is not inferred from capture time.
        </p>
      )}
      {capture.answerText ? (
        <blockquote className="whitespace-pre-wrap break-words border-l-2 border-primary/35 pl-4 text-sm leading-relaxed">
          {full ? capture.answerText : excerpt}
          {!full && capture.answerText.length > excerpt.length && '…'}
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
          : 'Each answer is one observation; provider results may differ from the consumer app.'}
        {viewedAt - Date.parse(observation.capturedAt) > 86400000 &&
          ' This saved observation is older than 24 hours; it remains historical evidence.'}
      </p>
      {full && (
        <>
          <section className="space-y-3">
            <h3 className="font-medium">Sources and reference strength</h3>
            <p className={small}>
              Returned search results, answer references, element references and verified inline
              references remain distinct. Reference linkage does not establish factual support.
            </p>
            {!capture.sources.length && <Empty>No source records returned with this answer.</Empty>}
            {capture.sources.map((source) => (
              <div key={source.id} className="rounded-lg border p-3 text-sm">
                <SafeSource url={source.url}>{source.title ?? source.url}</SafeSource>
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
  mention: 'Brand presence',
  recommendation: 'Brand recommendation',
  owned_answer_reference: 'Owned answer reference',
  owned_inline_reference: 'Owned inline reference',
  overview_occurrence: 'Answer feature occurrence',
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
  const chart: { day: string; value: number | null; observationId: string | null }[] = selected.map(
    (sample) => ({
      day: sample.day,
      value: sample.value * 100,
      observationId: sample.observationId,
    }),
  );
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
          <p className={small}>First eligible answer per UTC day · one frozen cohort at a time</p>
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
          label="Frozen cohort"
          value={activeSeries ?? ''}
          set={setSelectedSeries}
          options={series.map((value, index) => {
            const capture = observations.find((observation) =>
              samples.some(
                (sample) => sample.cohort === value && sample.observationId === observation.id,
              ),
            );
            return {
              value,
              label: `Cohort ${String(index + 1)} · ${capture ? `${geoSurfaces[capture.engine].label} · ${capture.context.promptText}` : value.slice(0, 12)} · ${String(samples.filter((sample) => sample.cohort === value).length)} daily samples`,
            };
          })}
        />
      )}
      {chart.length ? (
        <>
          <div
            className="h-60 w-full"
            role="img"
            aria-label={`${metricLabels[metric]} for selected frozen cohort. ${String(selected.reduce((sum, sample) => sum + sample.value, 0))} of ${String(selected.length)} eligible daily samples.`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 12, right: 10, bottom: 0, left: -22 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
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
          <p className={small}>
            {selected.reduce((sum, sample) => sum + sample.value, 0)} of {selected.length} eligible
            daily answers meet this metric. Different prompt versions, configuration or reported
            models start separate cohorts; they are not joined as a comparable series. Pins are
            annotated only when their affected frozen scope is identified on this loaded cohort.
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
          classification remain readable below.
        </Empty>
      )}
      <p className={`border-t pt-3 ${small}`}>
        {trends.method} Measurement {trends.version}. Scope: {trends.captures} captures,{' '}
        {trends.classifiedCaptures} usable complete classifications. Rates are provisional and
        require review.
      </p>
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
  const [opened, setOpened] = useState(true);
  return (
    <div className="space-y-3 border-t pt-3">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <MapPin className="size-4" aria-hidden="true" />
        Action pins
      </h3>
      <p className={small}>
        Completion time and reported implementation time are distinct. Changes after a pin show
        correlation, not causality or financial ROI.
      </p>
      <Button
        size="sm"
        variant="outline"
        aria-expanded={opened}
        onClick={() => {
          setOpened((value) => !value);
        }}
      >
        {opened ? 'Hide pins' : 'Inspect action pins'}
      </Button>
      {opened &&
        (relevant.length ? (
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
        ))}
    </div>
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
          Loading completion events…
        </p>
      )}
      {measurements.data && !relevant.length && (
        <p className={small}>{action.title}: no completion pins in this period.</p>
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
            {action.category === 'owned' ? 'Web / Owned' : 'Earned Media'} · completion recorded{' '}
            {time(pin.recordedAt)} · implementation reported {time(pin.implementedAt)}
          </p>
          <p className="whitespace-pre-wrap break-words text-sm">{pin.changeDescription}</p>
          {pin.changeUrl && <SafeSource url={pin.changeUrl}>Implemented change</SafeSource>}
          <p className={small}>
            Before: {time(pin.beforeWindow.from)} — {time(pin.beforeWindow.to)}
            <br />
            After: {time(pin.afterWindow.from)} — {time(pin.afterWindow.to)} ·{' '}
            {pin.windowComplete ? 'Window complete' : 'Partial window'}
          </p>
          {pin.metrics.map((metric) => (
            <p key={metric.metric} className={small}>
              {metricLabels[metric.metric]}:{' '}
              <strong className="text-foreground">{metric.outcome}</strong> ·{' '}
              {metric.before === null ? 'Unknown' : `${String(Math.round(metric.before * 100))}%`} (
              {metric.beforeSamples} samples) →{' '}
              {metric.after === null ? 'Unknown' : `${String(Math.round(metric.after * 100))}%`} (
              {metric.afterSamples} samples) ·{' '}
              {metric.scopeComplete ? 'Scope complete' : 'Scope incomplete'}
              {metric.limitedData && ' · limited data'}
            </p>
          ))}
          {pin.limitations.map((note) => (
            <p key={note} className={small}>
              {note}
            </p>
          ))}
          <details>
            <summary className="cursor-pointer text-xs">
              Inspect baseline and follow-up evidence
            </summary>
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
  const trends = useResource<GeoTrends>(`/geo/trends?${filter.query}`, true);
  const actions = useResource<GeoAction[]>('/geo/actions', true);
  const analyses = useResource<GeoAnalysis[]>('/geo/analyses', true);
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
  if (!data.project) return <Navigate to="/app/onboarding" replace />;
  return (
    <section className="space-y-6">
      <div>
        <p className={small}>
          {data.project.brandName} · {data.project.canonicalDomain}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Visibility & action overview</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Review AI answers. Complete evidence-backed work. Measure comparable follow-up.
        </p>
      </div>
      <EvidenceFilters filter={filter} />
      <ScopeLabel filter={filter} />
      <GeoMonitor
        promptIds={filter.promptId ? [filter.promptId] : undefined}
        selectedEngines={filter.engine ? [filter.engine] : undefined}
        onComplete={() => {
          void observations.reload();
          void trends.reload();
          void actions.reload();
          void analyses.reload();
        }}
      />
      {[observations.error, trends.error, actions.error, analyses.error].map((error, index) => (
        <ErrorNotice key={index} error={error} />
      ))}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [
            'Captured answers',
            String(trends.data?.captures ?? '—'),
            `Selected ${filter.days}-day scope · failed captures excluded`,
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
            String(jobs.length),
            `${String(jobs.filter((a) => a.category === 'owned').length)} Web / Owned · ${String(jobs.filter((a) => a.category === 'earned').length)} Earned Media`,
          ],
          [
            'Evidence freshness',
            proof ? time(proof.capturedAt) : 'No saved answer',
            'Latest capture in the selected scope',
          ],
        ].map(([label, value, note]) => (
          <div key={label} className={box}>
            <p className={small}>{label}</p>
            <p className="mt-3 break-words text-2xl font-semibold tabular-nums tracking-tight">
              {value}
            </p>
            <p className={`mt-2 ${small}`}>{note}</p>
          </div>
        ))}
      </div>
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
          ) : !observations.data?.observations.length ? (
            <Empty>
              No saved GEO answers in this scope. Configure monitoring and capture your first
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
            All observations & prompt × engine matrix
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
      <p className={small}>
        <Link className="text-primary underline" to="/app/questions">
          Legacy questions, frozen trial & history
        </Link>{' '}
        remain available.{' '}
        <a className="text-primary underline" href="/app/overview?fixture=1">
          Open local fixture workspace — synthetic data, no provider calls
        </a>
        .
      </p>
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
    <section className="space-y-5">
      <h1 className="text-3xl font-semibold tracking-tight">Observations</h1>
      <EvidenceFilters filter={filter} />
      <ScopeLabel filter={filter} />
      <ErrorNotice error={observations.error} />
      <Link className="inline-block text-sm text-primary underline" to="/app/questions">
        Legacy evidence & frozen trial history
      </Link>
      {observations.loading ? (
        <p role="status">Loading saved AI answers…</p>
      ) : (
        observations.data && (
          <>
            <PromptMatrix observations={observations.data.observations} />
            {!observations.data.observations.length && (
              <Empty>No saved GEO observations in this period and scope.</Empty>
            )}
            <div className="grid gap-3">
              {observations.data.observations.map((observation) => (
                <Link
                  key={observation.id}
                  to={`/app/observations/${encodeURIComponent(observation.id)}`}
                  className={`${box} block space-y-2 hover:border-primary/40`}
                >
                  <p className="text-sm font-medium">{observation.context.promptText}</p>
                  <p className={small}>
                    {geoSurfaces[observation.engine].label} · {time(observation.capturedAt)} ·{' '}
                    {words(observation.capture.quality)}
                  </p>
                  <p className="line-clamp-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                    {observation.capture.answerText ||
                      'No answer feature. Raw provider envelope retained.'}
                  </p>
                  <span className="inline-block text-xs font-medium text-primary">
                    View full answer & raw JSON →
                  </span>
                </Link>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {cursor && (
                <Button
                  variant="outline"
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
                  onClick={() => {
                    const next = new URLSearchParams(filter.params);
                    next.set('cursor', nextCursor);
                    filter.setParams(next);
                  }}
                >
                  Older observations
                </Button>
              )}
            </div>
          </>
        )
      )}
    </section>
  );
}
function PromptMatrix({ observations }: { observations: GeoObservation[] }) {
  const { data } = useOutletContext<WorkspaceContext>();
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
                          to={`/app/observations/${encodeURIComponent(observation.id)}`}
                        >
                          {words(observation.capture.quality)}
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
function AnalysisCard({ analysis }: { analysis: GeoAnalysis }) {
  const classification = analysis.classification;
  return (
    <article className={`${box} space-y-3`}>
      <div className="flex flex-wrap justify-between gap-2">
        <h3 className="font-semibold">{words(analysis.state)} classification</h3>
        <Badge variant="outline">Needs review</Badge>
      </div>
      <p className={small}>
        {analysis.model} · {time(analysis.createdAt)} · rubric {analysis.rubricVersion} · policy{' '}
        {analysis.policyVersion}
      </p>
      {classification ? (
        <>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p>
              Answer quality: <strong>{words(classification.answerQuality)}</strong>
            </p>
            <p>
              Brand presence: <strong>{words(classification.brandPresence)}</strong>
            </p>
            <p>
              Brand stance: <strong>{words(classification.brandStance)}</strong>
            </p>
            <p>
              Evidence support: <strong>{words(classification.evidenceSupport)}</strong>
            </p>
          </div>
          <p className={small}>
            {classification.scope} answer scope · returned model {classification.model} · provider{' '}
            {classification.provider}. Native probabilities express model uncertainty; they are not
            validated performance guarantees.
          </p>
          {Object.entries(classification.fitByCriterion).map(([criterion, fit]) => (
            <p key={criterion} className="text-sm">
              {criterion}: {words(fit)}
            </p>
          ))}
          {classification.evidence.map((evidence) => (
            <blockquote key={evidence.id} className="space-y-1 border-l-2 pl-3">
              <p className="whitespace-pre-wrap break-words text-sm">{evidence.quote}</p>
              <p className={small}>
                Original answer offsets {evidence.start}–{evidence.end} · support probability{' '}
                {evidence.supportProbability} · evidence {evidence.id}
              </p>
            </blockquote>
          ))}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Persisted diagnoses</h4>
            {!analysis.diagnoses.length && (
              <Empty>
                No diagnosis established by this analysis. Missing classification is not an
                optimisation diagnosis.
              </Empty>
            )}
            {analysis.diagnoses.map((diagnosis, index) => (
              <div
                key={`${diagnosis.type}-${String(index)}`}
                className="rounded-lg border p-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{words(diagnosis.type)}</strong>
                  <Badge variant="outline">{diagnosis.status}</Badge>
                </div>
                <p className="mt-2">{words(diagnosis.reasonCode)}</p>
                <p className={small}>
                  Supporting evidence: {diagnosis.evidenceIds.join(', ') || 'None'}
                  {diagnosis.checkIds?.length
                    ? ` · page checks: ${diagnosis.checkIds.join(', ')}`
                    : ''}
                </p>
                {diagnosis.targetUrl && (
                  <SafeSource url={diagnosis.targetUrl}>Target page</SafeSource>
                )}
                {diagnosis.missingChecks.length > 0 && (
                  <p className={`mt-2 ${small}`}>
                    Still required: {diagnosis.missingChecks.map(words).join(', ')}.
                  </p>
                )}
                <p className={`mt-2 ${small}`}>
                  Needs human review. Answer text alone does not establish a retrieval root cause.
                </p>
              </div>
            ))}
          </div>
          <details className="border-t pt-3">
            <summary className="cursor-pointer text-sm">
              Native decision probabilities and versions
            </summary>
            <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/30 p-3 text-xs">
              {JSON.stringify(classification.native, null, 2)}
            </pre>
            <p className={`mt-3 ${small}`}>
              Analysis {analysis.id} · input hash {analysis.inputHash ?? 'Unavailable'} ·{' '}
              {analysis.latencyMs === null
                ? 'Latency unavailable'
                : `${String(analysis.latencyMs)} ms`}{' '}
              · estimated cost{' '}
              {analysis.estimatedCostUsd === null
                ? 'Unknown'
                : `$${analysis.estimatedCostUsd.toFixed(6)} USD`}{' '}
              · ownership {classification.ownershipVersion}
            </p>
          </details>
        </>
      ) : (
        <Empty>
          {analysis.failureCode
            ? `Analysis failed: ${analysis.failureCode}.`
            : `Analysis ${analysis.state}.`}{' '}
          Original captured answer remains available. Processing can resume from stored evidence
          without another collector call.
        </Empty>
      )}
      <Link
        className="inline-block text-xs text-primary underline"
        to={`/app/observations/${encodeURIComponent(analysis.observationId)}`}
      >
        Inspect supporting original answer
      </Link>
    </article>
  );
}
export function GeoObservationDetail() {
  const { observationId = '' } = useParams();
  const path = `/geo/observations/${encodeURIComponent(observationId)}`;
  const observation = useResource<GeoObservation>(path);
  const analyses = useResource<GeoAnalysis[]>(`${path}/analyses`, analysisPending);
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
      .map((source) => source.url) ?? [];
  const home = observation.data?.context.brand.domain
    ? `https://${observation.data.context.brand.domain}/`
    : null;
  const targets = Array.from(new Set([...checkedSources, ...(home ? [home] : [])]));
  const chosenTarget = targets.includes(target) ? target : targets[0];
  const latest = analyses.data?.[0];
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Original observation</h1>
        <Link className="text-sm text-primary underline" to="/app/observations">
          All observations
        </Link>
      </div>
      <ErrorNotice error={observation.error} />
      {observation.loading ? (
        <p role="status">Loading immutable capture…</p>
      ) : (
        observation.data && <ObservationProof observation={observation.data} full />
      )}
      <section className={`${box} space-y-3`}>
        <h2 className="font-semibold">Decision analysis · captured evidence retained</h2>
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
            ? `Configured classifier: ${capabilities.data.classifier.model}. Processing spends processing allowance; it does not recollect a paid AI answer.`
            : (capabilities.data?.classifier.reason ?? 'Checking classifier availability…')}{' '}
          All classifications need review.
        </p>
        {analyses.loading && <p role="status">Loading analysis history…</p>}
        {analyses.data?.length === 0 && (
          <Empty>
            Classification pending or unavailable. You can inspect the original answer and raw
            provider envelope above.
          </Empty>
        )}
      </section>
      {analyses.data?.map((analysis) => (
        <AnalysisCard key={analysis.id} analysis={analysis} />
      ))}
      <section className={`${box} space-y-3`}>
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
  return (
    <section className="space-y-5">
      <h1 className="text-3xl font-semibold tracking-tight">Diagnoses</h1>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Review persisted retrieval, evidence and recommendation-fit findings together. Suspected and
        unknown causes remain explicit; every finding requires human review and supporting original
        evidence.
      </p>
      <ErrorNotice error={analyses.error} />
      {analyses.loading ? (
        <p role="status">Loading persisted analyses…</p>
      ) : analyses.data?.length ? (
        analyses.data.map((analysis) => <AnalysisCard key={analysis.id} analysis={analysis} />)
      ) : (
        <Empty>
          No analysis recorded yet.{' '}
          <Link className="text-primary underline" to="/app/observations">
            Inspect captured answers
          </Link>{' '}
          and start analysis when the classifier is configured.
        </Empty>
      )}
    </section>
  );
}
function ActionCard({ action }: { action: GeoAction }) {
  return (
    <Link
      to={`/app/playbook/${encodeURIComponent(action.id)}`}
      className="block space-y-2 rounded-lg border p-4 hover:border-primary/40"
    >
      <div className="flex flex-wrap gap-2">
        <Badge variant={action.category === 'owned' ? 'secondary' : 'outline'}>
          {action.category === 'owned' ? 'Web / Owned' : 'Earned Media'}
        </Badge>
        <Badge variant="outline">{words(action.status)}</Badge>
        <span className={small}>Priority {action.priority}</span>
      </div>
      <h3 className="text-sm font-semibold">{action.title}</h3>
      <p className={small}>{action.reason}</p>
      <p className={small}>
        {action.evidenceCount} supporting records · {action.scopes.length} frozen scopes ·{' '}
        {action.effort} · Needs review
      </p>
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
      <h1 className="text-3xl font-semibold tracking-tight">Action Playbook</h1>
      <p className="text-sm text-muted-foreground">
        Review the brief, accept work, and implement it in your own tools. Completion records a
        change and a pin; capture a fresh follow-up explicitly when ready.
      </p>
      <Choice
        label="Action status"
        value={status}
        set={setStatus}
        options={[
          { value: 'active', label: 'Proposed & active work' },
          { value: 'completed', label: 'Completed' },
          { value: 'dismissed', label: 'Dismissed' },
          { value: 'all', label: 'All actions' },
        ]}
      />
      <ErrorNotice error={actions.error} />
      <p className={small}>
        {visible.length} tasks in this view · {owned} Web / Owned · {visible.length - owned} Earned
        Media. Counts describe actual project work; no target split is assumed.
      </p>
      {actions.loading ? (
        <p role="status">Loading proposed and accepted work…</p>
      ) : visible.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((action) => (
            <ActionCard key={action.id} action={action} />
          ))}
        </div>
      ) : (
        <Empty>
          No tasks in this view. Unavailable classification does not create an optimisation brief.
        </Empty>
      )}
    </section>
  );
}
export function GeoActionPage() {
  const { actionId = '' } = useParams();
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Action brief</h1>
        <Link className="text-sm text-primary underline" to="/app/playbook">
          All work
        </Link>
      </div>
      <ErrorNotice error={detail.error ?? mutation.error} />
      {detail.loading ? (
        <p role="status">Loading action and evidence…</p>
      ) : (
        action && (
          <>
            <section className={`${box} space-y-4`}>
              <div className="flex flex-wrap gap-2">
                <Badge>{action.category === 'owned' ? 'Web / Owned' : 'Earned Media'}</Badge>
                <Badge variant="outline">{words(action.status)}</Badge>
                <Badge variant="outline">Needs review</Badge>
              </div>
              <h2 className="text-xl font-semibold">{action.title}</h2>
              <p className="text-sm">{action.reason}</p>
              <p className={small}>
                Priority {action.priority}: {action.priorityReason} · Effort: {action.effort}
              </p>
              {action.targetUrl ? (
                <SafeSource url={action.targetUrl}>Target asset / platform</SafeSource>
              ) : (
                action.targetDomain && (
                  <p className="break-words text-sm">Target domain: {action.targetDomain}</p>
                )
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="text-sm font-medium">Deliverable</h3>
                  <p className={`mt-1 ${small}`}>{action.deliverable}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium">Completion criteria</h3>
                  <p className={`mt-1 ${small}`}>{action.doneCriteria}</p>
                </div>
              </div>
              <p className={small}>
                Template {action.templateId} · {action.templateVersion} · revision {action.revision}
              </p>
              <div className="flex flex-wrap gap-2">
                {['proposed', 'dismissed'].includes(action.status) && (
                  <Button
                    disabled={mutation.busy}
                    onClick={() => void mutation.run(() => patch({ status: 'accepted' }))}
                  >
                    Accept action
                  </Button>
                )}
                {action.status !== 'completed' && action.status !== 'dismissed' && (
                  <Button
                    variant="outline"
                    disabled={mutation.busy}
                    onClick={() => void mutation.run(() => patch({ status: 'dismissed' }))}
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
                <legend className="text-sm font-medium">Implementation checklist</legend>
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
                    <span>{step.text}</span>
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
            <details className={`${box} space-y-3`}>
              <summary className="cursor-pointer font-semibold">
                Supporting evidence & frozen scope · {action.evidenceCount} records
              </summary>
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
                    Inspect original prompt, quote & source strength
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
                <h2 className="font-semibold">Record implementation & complete</h2>
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
                  Reported implementation time
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
                  Implementation time is interpreted in your local timezone. Completion creates an
                  immutable change record and action pin. It does not start another provider
                  capture.
                </p>
                <Button disabled={mutation.busy}>Complete action & record pin</Button>
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
                  Previous completion events, change descriptions and pins remain in the audit
                  history.
                </p>
                <Button variant="outline" disabled={mutation.busy}>
                  Reopen action
                </Button>
              </form>
            )}
            <section className={`${box} space-y-3`}>
              <h2 className="font-semibold">Follow-up measurement</h2>
              <p className={small}>
                Compare the frozen action scope against fresh answers. Monitoring uses current
                prompt versions and settings; changed context can make the outcome inconclusive.
                Successful completion alone is not a capture or improvement.
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
              <h2 className="font-semibold">Action event history</h2>
              {detail.data?.events.map((event) => (
                <div key={event.id} className="rounded-lg border p-3">
                  <p className="text-sm font-medium">
                    {words(event.kind)} · {time(event.recordedAt)}
                  </p>
                  <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                    {JSON.stringify(event.details, null, 2)}
                  </pre>
                  <p className={small}>
                    {event.scopes.length} frozen scopes · {event.evidenceIds.length} evidence
                    records
                  </p>
                </div>
              ))}
            </section>
          </>
        )
      )}
    </section>
  );
}
export function GeoSources() {
  const filter = useEvidenceFilter();
  const sources = useResource<GeoSourceOpportunity[]>(`/geo/sources?${filter.query}`);
  return (
    <section className="space-y-5">
      <h1 className="text-3xl font-semibold tracking-tight">Sources</h1>
      <EvidenceFilters filter={filter} />
      <ScopeLabel filter={filter} />
      <p className="max-w-3xl text-sm text-muted-foreground">
        Ownership describes who controls a source. Reference strength describes how it appeared in
        an answer. A returned search result is not a verified inline citation; competitor
        co-occurrence is not causal linkage.
      </p>
      <ErrorNotice error={sources.error} />
      {sources.loading ? (
        <p role="status">Loading observed source frequency…</p>
      ) : sources.data?.length ? (
        sources.data.map((source) => (
          <article key={source.url} className={`${box} space-y-3`}>
            <div className="flex flex-wrap justify-between gap-3">
              <SafeSource url={source.url}>{source.title ?? source.domain}</SafeSource>
              <Badge variant="outline">{words(source.role)}</Badge>
            </div>
            <p className={small}>
              {source.observations} of {source.denominator} eligible classified observations in
              scope · {time(source.period.from)} — {time(source.period.to)}
            </p>
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <p>{source.returnedResults} returned results</p>
              <p>{source.answerReferences} answer references</p>
              <p>{source.inlineReferences} verified inline references</p>
            </div>
            <p className={small}>
              {source.competitorCooccurrences} competitor co-occurrences · direct competitor
              linkage: unverified ·{' '}
              {source.engines.map((engine) => geoSurfaces[engine].label).join(', ')}
            </p>
            <details>
              <summary className="cursor-pointer text-xs font-medium">
                Inspect supporting observations
              </summary>
              <ul className="mt-2 flex flex-wrap gap-3">
                {source.observationIds.map((id) => (
                  <li key={id}>
                    <Link
                      to={`/app/observations/${encodeURIComponent(id)}`}
                      className="break-all text-xs text-primary underline"
                    >
                      Original answer {id}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          </article>
        ))
      ) : (
        <Empty>
          No observed source opportunities in this scope. Missing or incomplete classification does
          not establish a missing source.
        </Empty>
      )}
    </section>
  );
}
export function GeoCompetitors() {
  const filter = useEvidenceFilter();
  const observations = useResource<GeoObservationPage>(`/geo/observations?${filter.query}`);
  const analyses = useResource<GeoAnalysis[]>('/geo/analyses');
  const classified =
    observations.data?.observations.flatMap((observation) => {
      const analysis = analyses.data?.find(
        (row) => row.observationId === observation.id && row.state === 'completed',
      );
      return analysis?.classification
        ? [{ observation, analysis, classification: analysis.classification }]
        : [];
    }) ?? [];
  return (
    <section className="space-y-5">
      <h1 className="text-3xl font-semibold tracking-tight">Competitors</h1>
      <EvidenceFilters filter={filter} />
      <ScopeLabel filter={filter} />
      <ErrorNotice error={observations.error ?? analyses.error} />
      <p className="text-sm text-muted-foreground">
        Frozen competitor context and actual classified stance in {classified.length} classified
        captures of {observations.data?.observations.length ?? 0} captures on this loaded page.
        These observations do not establish rankings, market share or revenue.
      </p>
      {observations.loading || analyses.loading ? (
        <p role="status">Loading competitor evidence…</p>
      ) : !classified.length ? (
        <Empty>No classified competitor evidence in this scope yet.</Empty>
      ) : (
        classified.map(({ observation, classification }) => (
          <article key={observation.id} className={`${box} space-y-3`}>
            <p className="text-sm font-medium">{observation.context.promptText}</p>
            <p className={small}>
              {geoSurfaces[observation.engine].label} · {time(observation.capturedAt)} · frozen
              context {observation.context.contextVersion} · {classification.scope} analysis · Needs
              review
            </p>
            {observation.context.competitors.map((competitor) => (
              <div
                key={competitor.id}
                className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm"
              >
                <span>
                  {competitor.name}
                  <span className={`ml-2 ${small}`}>
                    {competitor.domain ?? 'Domain not configured'}
                  </span>
                </span>
                <span>
                  {words(
                    classification.competitors.find((row) => row.id === competitor.id)?.stance ??
                      'unknown',
                  )}
                </span>
              </div>
            ))}
            <p className={small}>
              Brand stance in the same answer: {words(classification.brandStance)}. Co-occurrence
              does not prove that a competitor displaced this brand.
            </p>
            <Link
              className="inline-block text-xs text-primary underline"
              to={`/app/observations/${encodeURIComponent(observation.id)}`}
            >
              Inspect classified stance and original answer
            </Link>
          </article>
        ))
      )}
      {observations.data?.nextCursor && (
        <p className={small}>
          More historical captures exist.{' '}
          <Link className="text-primary underline" to={`/app/observations?${filter.query}`}>
            Inspect paginated observations
          </Link>
          ; these competitor counts cover only the loaded page.
        </p>
      )}
    </section>
  );
}
interface GeoUsage {
  collectors: {
    today: number;
    month: number;
    reportedCostUsd: number;
    unknownCostAttempts: number;
    attempts: number;
  };
  processing: {
    today: number;
    estimatedCostUsd: number;
    unknownCostAttempts: number;
    attempts: number;
  };
  limits: { collectorDaily: number; collectorMonthly: number; processingDaily: number };
  classifierModel: string;
}
export function GeoBilling() {
  const { data } = useOutletContext<WorkspaceContext>();
  const usage = useResource<GeoUsage>('/geo/usage');
  const allowance = useResource<GeoAllowance>('/geo/allowance');
  return (
    <section className="space-y-5">
      <h1 className="text-3xl font-semibold tracking-tight">Billing & usage</h1>
      <p className="text-sm text-muted-foreground">
        Collector attempts and processing budgets are accounted for separately. Costs below describe
        recorded provider usage, not a new subscription price.
      </p>
      <ErrorNotice error={usage.error ?? allowance.error} />
      {usage.loading ? (
        <p role="status">Loading recorded usage…</p>
      ) : (
        usage.data && (
          <div className="grid gap-4 lg:grid-cols-2">
            <section className={`${box} space-y-3`}>
              <h2 className="font-semibold">AI answer collectors</h2>
              <p className="text-2xl font-semibold tabular-nums">
                {usage.data.collectors.today} / {usage.data.limits.collectorDaily}
              </p>
              <p className={small}>
                Attempts today · {usage.data.collectors.month} /{' '}
                {usage.data.limits.collectorMonthly} this UTC calendar month
              </p>
              <p className="text-sm">
                Reported provider cost: ${usage.data.collectors.reportedCostUsd.toFixed(6)} USD
              </p>
              <p className={small}>
                {usage.data.collectors.attempts} recorded attempts ·{' '}
                {usage.data.collectors.unknownCostAttempts} with unknown cost. The known total
                excludes unknown costs and is not a complete bill.
              </p>
            </section>
            <section className={`${box} space-y-3`}>
              <h2 className="font-semibold">Classification & page checks</h2>
              <p className="text-2xl font-semibold tabular-nums">
                {usage.data.processing.today} / {usage.data.limits.processingDaily}
              </p>
              <p className={small}>
                Processing attempts today · classifier {usage.data.classifierModel}
              </p>
              <p className="text-sm">
                Estimated processing cost: ${usage.data.processing.estimatedCostUsd.toFixed(6)} USD
              </p>
              <p className={small}>
                {usage.data.processing.attempts} recorded attempts ·{' '}
                {usage.data.processing.unknownCostAttempts} with unknown estimate. Estimates do not
                replace provider billing.
              </p>
            </section>
          </div>
        )
      )}
      {allowance.data && (
        <Empty>
          {allowance.data.enabled
            ? 'Manual checks are available within budget and cooldown.'
            : (allowance.data.reason ??
              'New checks are unavailable. Saved evidence remains readable.')}
        </Empty>
      )}
      <section className={`${box} space-y-3`}>
        <h2 className="font-semibold">Existing plan, trial & account</h2>
        <p className={small}>
          Legacy usage: {data.usage.today}/{data.usage.dailyLimit} attempts today ·{' '}
          {data.usage.month}/{data.usage.monthlyLimit} this month. These historical allowances are
          separate from GEO processing and collector budgets.
        </p>
        <Button asChild variant="outline" className="h-auto whitespace-normal text-center">
          <Link to="/app/settings">Review subscription & account actions</Link>
        </Button>
      </section>
    </section>
  );
}
export function GeoSettingsPanel() {
  const settings = useResource<GeoSettings>('/geo/settings');
  const capabilities = useResource<GeoCapabilities>('/geo/capabilities');
  const mutation = useMutation();
  const [draft, setDraft] = useState<GeoSettingsInput | null>(null);
  const [saved, setSaved] = useState(false);
  const value = draft ?? (settings.data?.engines ? settings.data : null);
  const selectedUnavailable =
    value?.engines.filter((engine) => !capabilities.data?.engines[engine].available) ?? [];
  return (
    <section className={`${box} space-y-4`}>
      <h2 className="text-lg font-medium">GEO monitoring configuration</h2>
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
              {engines.map((engine) => {
                const capability = capabilities.data?.engines[engine];
                return (
                  <label key={engine} className="flex items-start gap-3 rounded-lg border p-3">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 accent-primary"
                      checked={value.engines.includes(engine)}
                      disabled={!capability?.available && !value.engines.includes(engine)}
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
                      <span className="block text-sm font-medium">{geoSurfaces[engine].label}</span>
                      <span className={`block ${small}`}>
                        {capability?.available
                          ? `Configured · ${words(geoSurfaces[engine].collector)}`
                          : `Unavailable · ${capability?.reason ?? 'Provider is not configured.'}`}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
            <p className={small}>
              Availability reflects server configuration and secrets, not a validated live capture.
              Unavailable engines cannot be newly selected; their stored answers remain readable.
              Neutral prompts are sent without hidden brand or competitor hints.
            </p>
            {selectedUnavailable.length > 0 && (
              <Empty>
                Selected but unavailable:{' '}
                {selectedUnavailable.map((engine) => geoSurfaces[engine].label).join(', ')}. Remove
                unavailable engines before enabling daily checks, or save with daily monitoring
                disabled; historical captures stay unchanged.
              </Empty>
            )}
            <label className="flex items-start gap-3 text-sm">
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
                  Runs daily within server-side access, quota and cooldown. Manual checks remain
                  available independently.
                </span>
              </span>
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-2 text-sm">
                Language code
                <Input
                  required
                  pattern="[a-z]{2}(-[A-Z]{2})?"
                  value={value.languageCode}
                  placeholder="en"
                  onChange={(event) => {
                    setSaved(false);
                    setDraft({ ...value, languageCode: event.target.value });
                  }}
                />
              </label>
              <label className="space-y-2 text-sm">
                Provider location code
                <Input
                  required
                  type="number"
                  min={1}
                  step={1}
                  value={value.locationCode}
                  onChange={(event) => {
                    setSaved(false);
                    setDraft({ ...value, locationCode: Number(event.target.value) });
                  }}
                />
              </label>
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
              Locale and device are recorded with each request and applied only where the collector
              supports them. Changing material configuration starts a new comparable cohort.
            </p>
            <Button
              disabled={
                mutation.busy ||
                !value.engines.length ||
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
        Classifier: {capabilities.data?.classifier.model ?? 'Loading…'} ·{' '}
        {capabilities.data?.classifier.available
          ? 'Configured · all decisions need review'
          : (capabilities.data?.classifier.reason ?? 'Availability not loaded')}
        . Processing can use stored answers without a new collector call.
      </p>
      <Link className="text-xs text-primary underline" to="/app/billing">
        Review collector & processing budgets
      </Link>
    </section>
  );
}
export function GeoPromptSets() {
  const { data } = useOutletContext<WorkspaceContext>();
  const settings = useResource<GeoSettings>('/geo/settings');
  const sets = useResource<GeoPromptSet[]>('/geo/prompt-sets');
  const observations = useResource<GeoObservationPage>('/geo/observations?days=30');
  const mutation = useMutation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [promptIds, setPromptIds] = useState<string[]>([]);
  const [monitorSet, setMonitorSet] = useState('all');
  const active =
    data.project?.questions.filter((prompt) => prompt.enabled && !prompt.archivedAt) ?? [];
  const selectedSet = sets.data?.find((set) => set.id === monitorSet);
  const retired = promptIds.filter((id) => !active.some((prompt) => prompt.id === id));
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Named prompt sets</h2>
        <p className={`mt-2 ${small}`}>
          Group existing active buyer questions. Set membership does not change a prompt or its
          frozen observation history.
        </p>
      </div>
      <ErrorNotice error={sets.error ?? observations.error ?? mutation.error} />
      {settings.data?.configured && (
        <>
          <Choice
            label="Monitoring prompt set"
            value={selectedSet?.id ?? 'all'}
            set={setMonitorSet}
            options={[
              { value: 'all', label: 'All active prompts' },
              ...(sets.data ?? []).map((set) => ({ value: set.id, label: set.name })),
            ]}
          />
          <GeoMonitor
            promptIds={selectedSet?.promptIds}
            onComplete={() => void observations.reload()}
          />
        </>
      )}
      {sets.loading ? (
        <p role="status">Loading prompt sets…</p>
      ) : sets.data?.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {sets.data.map((set) => (
            <article key={set.id} className={`${box} space-y-3`}>
              <h3 className="font-medium">{set.name}</h3>
              <p className={small}>
                {set.promptIds.length} prompts · updated {time(set.updatedAt)}
              </p>
              <ul className="space-y-2 text-sm">
                {set.promptIds.map((id) => (
                  <li key={id}>
                    {data.project?.questions.find((prompt) => prompt.id === id)?.text ??
                      `Historical prompt ${id}`}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!data.canScan || mutation.busy}
                  onClick={() => {
                    setEditingId(set.id);
                    setName(set.name);
                    setPromptIds(set.promptIds);
                  }}
                >
                  Edit set
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!data.canScan || mutation.busy}
                  onClick={() =>
                    void mutation.run(async () => {
                      await api(
                        `/geo/prompt-sets/${encodeURIComponent(set.id)}`,
                        undefined,
                        'DELETE',
                      );
                      if (editingId === set.id) {
                        setEditingId(null);
                        setName('');
                        setPromptIds([]);
                      }
                      await sets.reload();
                    })
                  }
                >
                  Delete set
                </Button>
              </div>
              <Link
                className="inline-block text-xs text-primary underline"
                to={`/app/observations?promptId=${encodeURIComponent(set.promptIds[0] ?? '')}`}
              >
                Inspect set's first prompt evidence
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <Empty>No named prompt sets yet. Your existing buyer questions remain below.</Empty>
      )}
      {data.canScan && (
        <form
          className={`${box} space-y-3`}
          onSubmit={(event) => {
            event.preventDefault();
            void mutation.run(async () => {
              await api('/geo/prompt-sets', {
                ...(editingId ? { id: editingId } : {}),
                name,
                promptIds,
              });
              setEditingId(null);
              setName('');
              setPromptIds([]);
              await sets.reload();
            });
          }}
        >
          <h3 className="font-medium">{editingId ? 'Edit prompt set' : 'Create prompt set'}</h3>
          <label className="block space-y-2 text-sm">
            Set name
            <Input
              required
              maxLength={100}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </label>
          <fieldset className="space-y-3">
            <legend className="mb-2 text-sm">Active prompts</legend>
            {active.map((prompt) => (
              <label key={prompt.id} className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4 shrink-0 accent-primary"
                  checked={promptIds.includes(prompt.id)}
                  onChange={(event) => {
                    setPromptIds(
                      event.target.checked
                        ? [...promptIds, prompt.id]
                        : promptIds.filter((id) => id !== prompt.id),
                    );
                  }}
                />
                <span>{prompt.text}</span>
              </label>
            ))}
          </fieldset>
          {retired.map((id) => (
            <div
              key={id}
              className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm"
            >
              <span>
                Inactive member:{' '}
                {data.project?.questions.find((prompt) => prompt.id === id)?.text ?? id}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setPromptIds((previous) => previous.filter((value) => value !== id));
                }}
              >
                Remove inactive member
              </Button>
            </div>
          ))}
          {retired.length > 0 && (
            <p className={small}>
              Remove inactive members explicitly before resaving this active monitoring set. Their
              observation history remains available.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button disabled={mutation.busy || !promptIds.length || retired.length > 0}>
              Save prompt set
            </Button>
            {editingId && (
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setName('');
                  setPromptIds([]);
                }}
              >
                Cancel edit
              </Button>
            )}
          </div>
        </form>
      )}
      {observations.data?.observations && (
        <PromptMatrix observations={observations.data.observations} />
      )}
    </section>
  );
}

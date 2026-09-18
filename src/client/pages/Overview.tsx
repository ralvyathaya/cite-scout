import { ArrowUpRight, Info, TrendingDown, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/client/components/ui/badge';
import { Button } from '@/client/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/client/components/ui/card';
import { Skeleton } from '@/client/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/client/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/client/components/ui/tooltip';
import { StatusBadge } from '@/client/components/status-badge';
import { cn } from '@/client/lib/utils';
import { usePageTitle } from '@/client/use-page-title';
import { PageState } from './AppShell';
import { useDashboardContext } from './dashboard-context';
import type { DashboardPayload } from './dashboard-view';
import { fmtDelta, fmtPercent, fmtPosition, fmtScore } from './dashboard-view';

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${String(count)} ${count === 1 ? singular : plural}`;
}

function formatLastSuccess(iso: string): string {
  const date = new Date(iso);
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)} UTC`;
}

const metricDefinitions = {
  visibilityScore:
    '100 × (0.7 × mention rate + 0.3 × average position quality). Rises when more successful answers mention you, and when you appear earlier among tracked products.',
  mentionRate:
    'Successful prompts that mention your brand ÷ successful prompts. Counts a prompt once even if your brand appears several times.',
  shareOfVoice:
    'Your mentions ÷ all tracked brand and competitor mentions. Each tracked entity counts at most once per answer.',
  avgPosition:
    'Where your brand first appears among tracked products in each answer, averaged over answers where you appeared.',
} as const;

function MetricCard({
  label,
  value,
  delta,
  deltaKind,
  definition,
  footer,
}: {
  label: string;
  value: string;
  delta?: string | null;
  deltaKind?: 'score' | 'percent';
  definition: string;
  footer?: string;
}) {
  const improving =
    delta === undefined || delta === null ? null : !delta.startsWith('-') || delta === '0';
  return (
    <Card className="gap-0 py-0">
      <CardContent className="px-4 py-4">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground/60 hover:text-foreground"
                aria-label={`What does ${label} mean?`}
              >
                <Info className="size-3.5" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-64 text-xs leading-relaxed">
              {definition}
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums">{value}</p>
        {delta !== undefined && (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            {delta !== null && delta !== 'Not enough data' && (
              <>
                {improving ? (
                  <TrendingUp className="size-3.5 text-emerald-600" aria-hidden="true" />
                ) : (
                  <TrendingDown className="size-3.5 text-red-600" aria-hidden="true" />
                )}
                <span className={improving ? 'text-emerald-700' : 'text-red-700'}>{delta}</span>
              </>
            )}
            {(delta === null || delta === 'Not enough data') && (
              <span>{delta ?? 'Not enough data'}</span>
            )}
            {deltaKind !== undefined && delta !== null && delta !== 'Not enough data' && (
              <span>vs yesterday</span>
            )}
          </p>
        )}
        {footer !== undefined && <p className="mt-1 text-xs text-muted-foreground">{footer}</p>}
      </CardContent>
    </Card>
  );
}

function TrendChart({ series }: { series: DashboardPayload['series'] }) {
  const points = series.filter((point) => point.visibilityScore !== null);
  if (points.length < 2)
    return (
      <div className="flex h-48 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        <p className="max-w-72 px-6 text-center">
          <strong className="text-foreground">Not enough data</strong> — a trend needs at least two
          completed daily observations.
        </p>
      </div>
    );

  const width = 600;
  const height = 180;
  const values = points.map((point) => point.visibilityScore ?? 0);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 100);
  const span = max - min || 1;
  const coords = points.map((point, index) => {
    const x = (index / (points.length - 1)) * width;
    const y = height - (((point.visibilityScore ?? 0) - min) / span) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = values.at(-1) ?? 0;
  const direction = last >= (values[0] ?? 0) ? 'improving' : 'declining';

  return (
    <div>
      <svg
        viewBox={`0 0 ${String(width)} ${String(height)}`}
        className="h-48 w-full"
        role="img"
        aria-label={`Visibility score is ${direction}, from ${(values[0] ?? 0).toFixed(1)} to ${last.toFixed(1)} across ${pluralize(points.length, 'observed day')}.`}
      >
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            x1="0"
            x2={String(width)}
            y1={String(height * fraction)}
            y2={String(height * fraction)}
            stroke="var(--border)"
            strokeWidth="1"
            strokeDasharray="3,3"
          />
        ))}
        <polygon
          points={`0,${String(height)} ${coords.join(' ')} ${String(width)},${String(height)}`}
          fill="var(--chart-1)"
          opacity="0.07"
        />
        <polyline
          points={coords.join(' ')}
          fill="none"
          stroke="var(--chart-1)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.length > 0 && (
          <circle
            cx={String(width)}
            cy={String(height - ((last - min) / span) * height)}
            r="4"
            fill="var(--chart-1)"
          />
        )}
      </svg>
      <div className="mt-1.5 flex justify-between text-xs tabular-nums text-muted-foreground">
        <span>{points[0]?.date}</span>
        <span>{points.at(-1)?.date}</span>
      </div>
      <table className="sr-only">
        <caption>Visibility score by observed date</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Visibility score</th>
            <th scope="col">Coverage</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.date}>
              <th scope="row">{point.date}</th>
              <td>{point.visibilityScore?.toFixed(1) ?? 'n/a'}</td>
              <td>{fmtPercent(point.coverage)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ShareOfVoice({ entities }: { entities: DashboardPayload['shareOfVoiceByEntity'] }) {
  if (entities.length === 0)
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Share of voice appears once tracked entities are mentioned in stored answers.
      </p>
    );
  const maxShare = Math.max(...entities.map((entity) => entity.share ?? 0), 0.01);
  return (
    <div className="flex flex-col gap-3.5">
      {entities.map((entity) => (
        <div key={entity.key}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className={cn('truncate', entity.key === 'brand' && 'font-semibold')}>
              {entity.label}
            </span>
            <span className="tabular-nums text-muted-foreground">{fmtPercent(entity.share)}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{
                width: `${String(Math.min(((entity.share ?? 0) / maxShare) * 100, 100))}%`,
                background: entity.key === 'brand' ? 'var(--chart-1)' : 'var(--chart-2)',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function RunScanButton({ data, onDone }: { data: DashboardPayload; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const runnable = data.prompts.filter((prompt) => prompt.observationDate !== data.observationDate);

  if (!data.entitlement.canScan)
    return (
      <Button asChild>
        <Link to="/app/billing">Upgrade to keep scanning</Link>
      </Button>
    );

  if (data.totalObservations === 0)
    return (
      <Button asChild>
        <Link to="/app/prompts">Run trial scan</Link>
      </Button>
    );

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        disabled={busy || runnable.length === 0}
        onClick={() => {
          setBusy(true);
          setMessage('');
          void fetch('/api/scans/today', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId: data.projectId,
              promptIds: runnable.map((prompt) => prompt.promptId),
            }),
          })
            .then(async (response) => {
              const body = (await response.json()) as {
                data?: { successful: number; failed: number };
                error?: { message: string };
              };
              setMessage(
                response.ok
                  ? `Scan finished: ${String(body.data?.successful ?? 0)} observed, ${String(body.data?.failed ?? 0)} failed.`
                  : (body.error?.message ?? 'Scan failed.'),
              );
              if (response.ok) onDone();
            })
            .catch(() => {
              setMessage('Network error while starting the scan.');
            })
            .finally(() => {
              setBusy(false);
            });
        }}
      >
        {busy
          ? 'Running…'
          : runnable.length === 0
            ? "Today's scan is complete"
            : "Run today's scan"}
      </Button>
      {message && (
        <p
          role="status"
          aria-live="polite"
          className="max-w-64 text-right text-xs text-muted-foreground"
        >
          {message}
        </p>
      )}
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6 p-6 lg:p-8">
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

export function AppOverview() {
  const { state, reload } = useDashboardContext();
  usePageTitle('Overview');

  if (state.status !== 'ready') return <PageState state={state} onRetry={reload} />;
  const data = state.data;

  return (
    <div className="p-6 lg:p-8">
      <div id="main" className="sr-only">
        Visibility overview
      </div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {data.brandName} · last {pluralize(data.series.length, 'observed day')}
          </p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight">Visibility overview</h1>
        </div>
        <RunScanButton data={data} onDone={reload} />
      </div>

      {data.entitlement.warning && (
        <div
          className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm"
          role="status"
        >
          <strong className="font-semibold text-amber-900">
            {data.entitlement.warning === 'payment'
              ? 'Billing needs attention.'
              : data.entitlement.warning === 'paused'
                ? 'Subscription paused.'
                : 'Subscription ended.'}
          </strong>
          <span className="text-amber-800">
            Historical results stay available, but new provider calls are blocked.
          </span>
          <Link
            to="/app/billing"
            className="ml-auto font-medium text-amber-900 underline-offset-4 hover:underline"
          >
            Open billing →
          </Link>
        </div>
      )}

      {data.totalObservations === 0 ? (
        <Card className="mx-auto max-w-md text-center">
          <CardHeader>
            <CardTitle>No observations yet</CardTitle>
            <CardDescription>
              Your trial scan has not produced stored results. Run the trial scan from the prompts
              page to collect your first genuine Perplexity observation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/app/prompts">Go to prompts</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Visibility score"
              value={fmtScore(data.current.visibilityScore)}
              delta={fmtDelta(data.delta.visibilityScore, 'score')}
              deltaKind="score"
              definition={metricDefinitions.visibilityScore}
            />
            <MetricCard
              label="Mention rate"
              value={fmtPercent(data.current.mentionRate)}
              delta={fmtDelta(data.delta.mentionRate, 'percent')}
              deltaKind="percent"
              definition={metricDefinitions.mentionRate}
            />
            <MetricCard
              label="Share of voice"
              value={fmtPercent(data.current.shareOfVoice)}
              delta={fmtDelta(data.delta.shareOfVoice, 'percent')}
              deltaKind="percent"
              definition={metricDefinitions.shareOfVoice}
            />
            <MetricCard
              label="Avg. mention position"
              value={fmtPosition(data.current.averageMentionPosition)}
              definition={metricDefinitions.avgPosition}
              footer={`Coverage ${fmtPercent(data.current.coverage)}`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">Visibility trend</CardTitle>
                  {data.provider && (
                    <Badge variant="secondary" className="font-normal text-muted-foreground">
                      {data.provider.name} · {data.provider.preset ?? 'default'}
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  Daily visibility score across all successful observations.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TrendChart series={data.series} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Share of voice</CardTitle>
                <CardDescription>Brand vs competitors, counted once per answer.</CardDescription>
              </CardHeader>
              <CardContent>
                <ShareOfVoice entities={data.shareOfVoiceByEntity} />
              </CardContent>
            </Card>
          </div>

          <Card className="gap-0 py-0">
            <div className="flex items-center justify-between gap-2 border-b px-5 py-3.5">
              <h2 className="text-base font-semibold">Prompt observations</h2>
              <p className="text-xs text-muted-foreground">
                {data.provider
                  ? `${data.provider.name} · ${data.provider.model ?? 'unknown model'}`
                  : 'No provider calls yet'}
                {data.lastSuccessfulAt
                  ? ` · last success ${formatLastSuccess(data.lastSuccessfulAt)}`
                  : ''}
              </p>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-5">Prompt</TableHead>
                  <TableHead>Brand status</TableHead>
                  <TableHead className="pr-5 text-right">First mention</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.prompts.map((prompt) => (
                  <TableRow key={prompt.promptId}>
                    <TableCell className="max-w-md pl-5">
                      <span className="line-clamp-1">{prompt.text}</span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge classification={prompt.classified} />
                    </TableCell>
                    <TableCell className="pr-5 text-right tabular-nums">
                      {prompt.brandPosition === null ? '—' : `#${String(prompt.brandPosition)}`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <p className="text-xs leading-relaxed text-muted-foreground">
            Metrics are directional observations collected over time from the Perplexity Agent API.
            They are not guaranteed rankings and may differ from the Perplexity consumer
            application. Interactive charts have tabular equivalents for screen readers.
          </p>
        </div>
      )}
    </div>
  );
}

export function OverviewSkeletonExport() {
  return <OverviewSkeleton />;
}

export function UnknownRoute() {
  usePageTitle('Page not found');
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">That application page does not exist.</p>
      <Button asChild className="mt-6">
        <Link to="/app/overview">
          Back to overview <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}

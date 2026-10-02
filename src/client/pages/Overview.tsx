import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  Copy,
  Info,
  ShieldAlert,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
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
import { ObservationSignal } from '@/client/components/status-badge';
import { ScanAction } from '@/client/components/scan-action';
import { DomainIcon } from '@/client/components/brand-icons';
import { cn } from '@/client/lib/utils';
import { sourceGuidance } from '@/domain/insights';
import { usePageTitle } from '@/client/use-page-title';
import { PageState } from './AppShell';
import { useDashboardContext } from './dashboard-context';
import type { DashboardPayload } from './dashboard-view';
import { fmtDelta, fmtPercent, fmtPosition, fmtScore } from './dashboard-view';

function pluralize(count: number, singular: string) {
  return `${String(count)} ${singular}${count === 1 ? '' : 's'}`;
}
const metricDefinitions = {
  visibilityScore:
    '100 × (0.7 × mention rate + 0.3 × average position quality). Based on first appearance among tracked products, not a recommendation ranking.',
  mentionRate:
    'Successful answers mentioning your brand ÷ successful answers. Each answer counts once.',
  shareOfVoice:
    'Your mentions ÷ all tracked brand and competitor mentions. Each entity counts once per answer.',
  avgPosition:
    'First appearance among tracked products, averaged only over successful answers mentioning your brand.',
};

function MetricCard({
  label,
  value,
  delta,
  definition,
  footer,
}: {
  label: string;
  value: string;
  delta?: string;
  definition: string;
  footer?: string;
}) {
  const neutral = !delta || delta === 'Not enough data' || /^[-+]?0(?:\.0)?(?: pp)?$/u.test(delta);
  return (
    <Card className="gap-0 rounded-lg py-0">
      <CardContent className="px-4 py-4 sm:px-5">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-medium leading-relaxed text-muted-foreground">{label}</p>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`What does ${label} mean?`}
                className="rounded text-muted-foreground hover:text-foreground"
              >
                <Info className="size-3.5" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-64 text-xs leading-relaxed">
              {definition}
            </TooltipContent>
          </Tooltip>
        </div>
        <p
          className={cn(
            'mt-2 font-semibold tracking-tight tabular-nums',
            value === 'Not enough data'
              ? 'text-sm text-muted-foreground sm:text-lg'
              : 'text-2xl sm:text-3xl',
          )}
        >
          {value}
        </p>
        {delta && (
          <p className="mt-2 flex flex-wrap gap-x-1 text-xs text-muted-foreground">
            <span
              className={cn(
                !neutral && (delta.startsWith('-') ? 'text-red-700' : 'text-emerald-700'),
              )}
            >
              {delta}
            </span>
            {delta !== 'Not enough data' && <span>vs previous observed day</span>}
          </p>
        )}
        {footer && <p className="mt-2 text-xs text-muted-foreground">{footer}</p>}
      </CardContent>
    </Card>
  );
}

function TrendChart({ series }: { series: DashboardPayload['series'] }) {
  const points = series.filter((point) => point.visibilityScore !== null);
  const width = 600,
    height = 180;
  const coords = series.map((point, index) =>
    point.visibilityScore === null
      ? null
      : {
          x: (index / Math.max(series.length - 1, 1)) * width,
          y: height - (point.visibilityScore / 100) * height,
        },
  );
  const path = coords
    .map((point, index) =>
      point === null
        ? ''
        : `${index === 0 || coords[index - 1] === null ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`,
    )
    .join(' ');
  return (
    <div>
      {points.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No successful observations in this period.
        </div>
      ) : (
        <svg
          viewBox={`-5 -5 ${String(width + 10)} ${String(height + 10)}`}
          className="h-40 w-full sm:h-48"
          role="img"
          aria-label={`Visibility scores over ${String(series.length)} calendar days; ${String(points.length)} days observed. Gaps mean no successful observations.`}
        >
          {[0.25, 0.5, 0.75].map((fraction) => (
            <line
              key={fraction}
              x1="0"
              x2={width}
              y1={height * fraction}
              y2={height * fraction}
              stroke="var(--border)"
              strokeDasharray="3,3"
            />
          ))}
          <path
            d={path}
            fill="none"
            stroke="var(--chart-1)"
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
          />
          {coords.map(
            (point, index) =>
              point && (
                <circle
                  key={series[index]?.date}
                  cx={point.x}
                  cy={point.y}
                  r="3"
                  fill="var(--chart-1)"
                >
                  <title>
                    {series[index]?.date}: {series[index]?.visibilityScore?.toFixed(1)}
                  </title>
                </circle>
              ),
          )}
        </svg>
      )}
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>{series[0]?.date}</span>
        <span>{series.at(-1)?.date}</span>
      </div>
      <div className="sr-only">
        <table>
          <caption>Visibility score by date</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Score</th>
              <th scope="col">Coverage</th>
            </tr>
          </thead>
          <tbody>
            {series.map((point) => (
              <tr key={point.date}>
                <th scope="row">{point.date}</th>
                <td>{point.visibilityScore?.toFixed(1) ?? 'No observation'}</td>
                <td>
                  {point.successful}/{point.attempted} attempted
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ShareOfVoice({ entities }: { entities: DashboardPayload['shareOfVoiceByEntity'] }) {
  if (entities.every((entity) => entity.share === null))
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No tracked entities were mentioned on the metric date.
      </p>
    );
  return (
    <ul className="space-y-4">
      {[...entities]
        .sort((a, b) => (b.share ?? 0) - (a.share ?? 0))
        .map((entity) => (
          <li key={entity.key}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
              <span className={cn('truncate', entity.key === 'brand' && 'font-semibold')}>
                {entity.label}
              </span>
              <span className="font-medium tabular-nums">{fmtPercent(entity.share)}</span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {pluralize(entity.mentions, 'mention')}
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div
                className={cn(
                  'h-full rounded-full',
                  entity.key === 'brand' ? 'bg-foreground' : 'bg-zinc-400',
                )}
                style={{ width: `${String((entity.share ?? 0) * 100)}%` }}
              />
            </div>
          </li>
        ))}
    </ul>
  );
}

function CopyReportButton({ data }: { data: DashboardPayload }) {
  const [state, setState] = useState<'idle' | 'copying' | 'copied'>('idle');
  async function copy() {
    setState('copying');
    try {
      if (!('clipboard' in navigator)) throw new Error('Clipboard is unavailable in this browser.');
      const lines = [
        `# ${data.brandName} — CiteScout visibility report`,
        `Metric date: ${data.latestObservationDate ?? 'No recent observations'} (UTC)`,
        `Visibility: ${fmtScore(data.current.visibilityScore)} · Mention rate: ${fmtPercent(data.current.mentionRate)}`,
        `Share of voice: ${fmtPercent(data.current.shareOfVoice)} · First-mention position: ${fmtPosition(data.current.averageMentionPosition)}`,
        `Coverage: ${String(data.current.successful)}/${String(data.current.attempted)} attempted observations`,
        '',
        ...data.prompts.map(
          (prompt) =>
            `${prompt.text}: ${prompt.insight.status === 'displaced' ? 'Displaced by Competitor' : prompt.insight.status} (${prompt.observationDate ?? 'not scanned'})${prompt.insight.explanation ? ` — ${prompt.insight.explanation}` : ''}${prompt.insight.context === 'negative' ? ' — Negative brand context' : ''}${prompt.observationId ? `\n${window.location.origin}/app/responses?observation=${encodeURIComponent(prompt.observationId)}` : ''}`,
        ),
        '',
        'First-mention order is not a recommendation ranking. Observations are directional.',
      ];
      await navigator.clipboard.writeText(lines.join('\n'));
      setState('copied');
      toast.success('Report copied');
    } catch (error) {
      setState('idle');
      toast.error(error instanceof Error ? error.message : 'Could not copy the report.');
    }
  }
  return (
    <Button
      variant="outline"
      disabled={state === 'copying'}
      aria-busy={state === 'copying'}
      onClick={() => {
        void copy();
      }}
    >
      {state === 'copied' ? (
        <Check className="size-4" aria-hidden="true" />
      ) : (
        <Copy className="size-4" aria-hidden="true" />
      )}
      {state === 'copying' ? 'Copying…' : state === 'copied' ? 'Copied' : 'Copy report'}
    </Button>
  );
}

function CompetitiveGaps({ data }: { data: DashboardPayload }) {
  const gaps = data.prompts.filter((prompt) => prompt.insight.status === 'displaced');
  const observed = data.prompts.filter((prompt) => prompt.insight.status !== 'unknown').length;
  return (
    <Card className={cn('gap-0 rounded-lg p-0', gaps.length > 0 && 'border-amber-200/80')}>
      <div className="flex flex-wrap items-center gap-3 border-b p-4 sm:px-5">
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-md border',
            gaps.length ? 'border-amber-200 bg-amber-50' : 'bg-muted',
          )}
        >
          <ShieldAlert
            className={cn('size-4', gaps.length ? 'text-amber-700' : 'text-muted-foreground')}
            aria-hidden="true"
          />
        </span>
        <div className="min-w-0 flex-1 basis-40">
          <h2 className="text-sm font-semibold">Competitive gaps</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {gaps.length > 0
              ? `Competitors appeared ahead of your brand in ${pluralize(gaps.length, 'prompt')} among ${String(observed)} with stored answers.`
              : observed > 0
                ? 'No first-mention displacement in the latest stored answers. This does not establish recommendation leadership.'
                : 'Collect successful observations to see where competitors appear ahead of your brand.'}
          </p>
        </div>
        {gaps.length > 0 && (
          <Badge variant="warning">{pluralize(gaps.length, 'prompt')} to review</Badge>
        )}
      </div>
      {gaps.length > 0 && (
        <ul className="divide-y px-4 sm:px-5">
          {gaps.map((prompt) => (
            <li
              key={prompt.promptId}
              className="flex flex-wrap items-center justify-between gap-3 py-4"
            >
              <div className="min-w-0 flex-1 basis-48">
                <p className="text-sm font-medium wrap-anywhere">{prompt.insight.explanation}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground wrap-anywhere">
                  {prompt.text}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{prompt.observationDate} UTC</p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link
                  to={`/app/responses?observation=${encodeURIComponent(prompt.observationId ?? '')}`}
                >
                  View evidence <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t bg-zinc-50/50 px-4 py-3 text-xs leading-relaxed text-muted-foreground sm:px-5">
        Positions describe first appearance among tracked brands, not a ranking by Perplexity.
      </p>
    </Card>
  );
}

function CitationOpportunities({ data }: { data: DashboardPayload }) {
  return (
    <Card id="overview-sources" className="scroll-mt-24 gap-4 rounded-lg p-4 sm:p-5">
      <div>
        <h2 className="text-base font-semibold">Citation opportunities</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sources returned with displaced answers · last {data.windowDays} calendar days
        </p>
      </div>
      {data.citationOpportunities.length > 0 ? (
        <ul className="divide-y">
          {data.citationOpportunities.map((item) => (
            <li key={item.domain} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-2 text-sm font-semibold underline-offset-4 hover:underline"
                >
                  <DomainIcon url={item.sourceUrl} className="size-4 shrink-0" />
                  {item.domain} ↗
                </a>
                <span className="text-xs text-muted-foreground">
                  {pluralize(item.count, 'related answer')}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed">{item.action}</p>
              <ul className="mt-2 space-y-1">
                {item.observations.map((observation) => (
                  <li key={observation.id}>
                    <Link
                      className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                      to={`/app/responses?observation=${encodeURIComponent(observation.id)}`}
                    >
                      {observation.prompt} · {observation.date} · View evidence
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <div>
          <p className="text-sm text-muted-foreground">
            No returned-source evidence from displaced answers yet. Gather more observations to
            identify relevant sources.
          </p>
          <details className="mt-4 rounded-md border bg-muted/20 p-3">
            <summary className="cursor-pointer text-sm font-medium">
              General guidance · not based on your observations
            </summary>
            <ul className="mt-3 space-y-3">
              {['reddit.com', 'g2.com', 'wikipedia.org', 'techcrunch.com'].map((domain) => (
                <li key={domain} className="text-xs leading-relaxed">
                  <strong>{domain}</strong> — {sourceGuidance(domain)}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        These are research opportunities, not proven ranking factors. Returned sources do not
        establish which source influenced a particular brand recommendation.
      </p>
    </Card>
  );
}

export function AppOverview() {
  usePageTitle('Overview');
  const { state, reload } = useDashboardContext();
  if (state.status === 'loading') return <OverviewSkeletonExport />;
  if (state.status === 'onboarding')
    return (
      <div className="p-6 lg:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Set up your brand monitoring</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Add your brand, competitors, and buyer prompts to see who appears in Perplexity answers.
        </p>
        <div className="mt-6 grid max-w-4xl gap-4 md:grid-cols-3">
          {[
            ['01', 'Brand & domain', 'Define the brand and canonical website to detect.'],
            ['02', 'Tracked competitors', 'Compare up to three competitors in the same answers.'],
            ['03', 'Buyer prompts', 'Track the questions customers ask when choosing a tool.'],
          ].map(([step, title, description]) => (
            <Card key={step} className="gap-2 p-5">
              <span className="font-mono text-xs text-muted-foreground">STEP {step}</span>
              <h2 className="text-base font-semibold">{title}</h2>
              <p className="text-sm text-muted-foreground">{description}</p>
            </Card>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/app/onboarding">Start project setup</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/demo">Explore sample dashboard</Link>
          </Button>
        </div>
      </div>
    );
  if (state.status !== 'ready') return <PageState state={state} onRetry={reload} />;
  const data = state.data;
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Visibility overview</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            See where competitors appear, inspect the answer, and plan your next move.
          </p>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            {data.latestObservationDate
              ? `Metrics for ${data.latestObservationDate} UTC`
              : 'No recent observations'}{' '}
            · {data.brandName}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-start gap-2 sm:w-auto">
          <CopyReportButton data={data} />
          <ScanAction data={data} onDone={reload} />
        </div>
      </div>
      <nav aria-label="Overview sections" className="mb-6 flex flex-wrap gap-1 border-b pb-3">
        {[
          ['#overview-summary', 'Summary'],
          ['#overview-observations', 'Observations'],
          ['#overview-sources', 'Sources'],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="flex min-h-9 items-center rounded-md px-3 text-xs font-medium text-muted-foreground hover:bg-white hover:text-foreground"
          >
            {label}
          </a>
        ))}
      </nav>
      {data.entitlement.warning && (
        <div
          role="status"
          className="mb-6 flex flex-wrap gap-2 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <strong>Billing needs attention.</strong>
          <span>New scans are paused; historical answers remain available.</span>
          <Link className="underline underline-offset-4" to="/app/billing">
            Open billing
          </Link>
        </div>
      )}
      <div className="space-y-6">
        <section
          id="overview-summary"
          aria-label="Visibility summary"
          className="scroll-mt-24 space-y-5"
        >
          <CompetitiveGaps data={data} />
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <MetricCard
              label="Visibility score"
              value={fmtScore(data.current.visibilityScore)}
              delta={fmtDelta(data.delta.visibilityScore, 'score')}
              definition={metricDefinitions.visibilityScore}
            />
            <MetricCard
              label="Mention rate"
              value={fmtPercent(data.current.mentionRate)}
              delta={fmtDelta(data.delta.mentionRate, 'percent')}
              definition={metricDefinitions.mentionRate}
            />
            <MetricCard
              label="Share of voice"
              value={fmtPercent(data.current.shareOfVoice)}
              delta={fmtDelta(data.delta.shareOfVoice, 'percent')}
              definition={metricDefinitions.shareOfVoice}
            />
            <MetricCard
              label="Avg. mention position"
              value={fmtPosition(data.current.averageMentionPosition)}
              definition={metricDefinitions.avgPosition}
              footer={`Coverage ${String(data.current.successful)}/${String(data.current.attempted)} attempted · ${fmtPercent(data.current.coverage)}`}
            />
          </div>
        </section>
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="rounded-lg xl:col-span-2">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">Visibility trend</CardTitle>
                {data.provider && (
                  <Badge variant="secondary">
                    {data.provider.name} · {data.provider.preset ?? 'default'}
                  </Badge>
                )}
              </div>
              <CardDescription>
                Last {data.windowDays} calendar days. Gaps indicate no successful observations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TrendChart series={data.series} />
            </CardContent>
          </Card>
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="text-base">Share of voice</CardTitle>
              <CardDescription>
                Counted once per answer · {data.latestObservationDate ?? 'no recent observations'}{' '}
                UTC.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ShareOfVoice entities={data.shareOfVoiceByEntity} />
            </CardContent>
          </Card>
        </div>
        <Card id="overview-observations" className="scroll-mt-24 gap-0 rounded-lg py-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">Prompt observations</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Latest stored answer per prompt · first-mention order
              </p>
            </div>
            <Link
              to="/app/prompts"
              className="flex min-h-9 items-center gap-1.5 text-xs font-medium hover:underline"
            >
              Manage prompts <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
          <Table className="observation-table" aria-label="Prompt observations">
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
                    <span className="block min-w-40 whitespace-normal wrap-anywhere">
                      {prompt.text}
                    </span>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {prompt.observationDate
                        ? `${prompt.observationDate} UTC`
                        : 'No stored answer'}
                    </p>
                    {prompt.observationId && (
                      <Link
                        className="mt-2 inline-block text-xs underline underline-offset-4"
                        to={`/app/responses?observation=${encodeURIComponent(prompt.observationId)}`}
                      >
                        View evidence
                      </Link>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <ObservationSignal
                      insight={prompt.insight}
                      attemptStatus={prompt.attemptStatus}
                    />
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    <span className="text-muted-foreground sm:hidden">First mention: </span>
                    {prompt.brandPosition === null ? '—' : `#${String(prompt.brandPosition)}`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {data.prompts.length === 0 && (
            <p className="p-5 text-sm text-muted-foreground">
              Add a buyer prompt to begin monitoring.
            </p>
          )}
        </Card>
        <CitationOpportunities data={data} />
        <p className="text-xs leading-relaxed text-muted-foreground">
          Directional observations from the Perplexity Agent API may differ from the consumer
          application. First-mention positions are not guaranteed rankings.
        </p>
      </div>
    </div>
  );
}

export function OverviewSkeletonExport() {
  return (
    <div className="space-y-6 p-6" role="status" aria-label="Loading overview">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[1, 2, 3, 4].map((key) => (
          <Skeleton key={key} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
export function UnknownRoute() {
  usePageTitle('Page not found');
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">That application page does not exist.</p>
      <Button asChild className="mt-6">
        <Link to="/app/overview">Back to overview</Link>
      </Button>
    </div>
  );
}

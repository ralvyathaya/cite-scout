import { ArrowUpRight, CircleDot } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { PageState } from './AppShell';
import { useDashboardContext } from './dashboard-context';
import { fmtDelta, fmtPercent, fmtPosition, fmtScore } from './dashboard-view';
import type { DashboardPayload } from './dashboard-view';

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${String(count)} ${count === 1 ? singular : plural}`;
}

function formatLastSuccess(iso: string): string {
  const date = new Date(iso);
  return `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)} UTC`;
}

function Trend({ series }: { series: DashboardPayload['series'] }) {
  const points = series.filter((point) => point.visibilityScore !== null);
  if (points.length < 2)
    return (
      <div className="chart-empty">
        <p>
          <strong>Not enough data</strong> — a trend needs at least two completed daily
          observations.
        </p>
      </div>
    );

  const width = 600;
  const height = 150;
  const values = points.map((point) => point.visibilityScore ?? 0);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 100);
  const span = max - min || 1;
  const coords = points.map((point, index) => {
    const x = (index / (points.length - 1)) * width;
    const y = height - (((point.visibilityScore ?? 0) - min) / span) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const best = Math.max(...values);
  const first = values[0] ?? 0;
  const last = values.at(-1) ?? 0;
  const direction = last >= first ? 'improving' : 'declining';

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${String(width)} ${String(height)}`}
        role="img"
        aria-label={`Visibility score is ${direction}, from ${first.toFixed(1)} to ${last.toFixed(1)} across ${pluralize(points.length, 'observed day')}, peaking at ${best.toFixed(1)}.`}
      >
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#145cff" stopOpacity=".22" />
            <stop offset="1" stopColor="#145cff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon
          points={`0,${String(height)} ${coords.join(' ')} ${String(width)},${String(height)}`}
          fill="url(#trend-fill)"
        />
        <polyline
          points={coords.join(' ')}
          fill="none"
          stroke="#145cff"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="chart-axis">
        <span>{points[0]?.date}</span>
        <span>{points.at(-1)?.date}</span>
      </div>
      <table className="visually-hidden">
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

function RunScanButton({ data, onDone }: { data: DashboardPayload; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const runnable = data.prompts.filter((prompt) => prompt.observationDate !== data.observationDate);

  if (!data.entitlement.canScan)
    return (
      <Link className="button" to="/app/billing">
        Upgrade to keep scanning
      </Link>
    );

  if (data.totalObservations === 0)
    return (
      <Link className="button" to="/app/prompts">
        Run trial scan from prompts
      </Link>
    );

  return (
    <div className="run-cell">
      <button
        type="button"
        className="button"
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
      </button>
      {message && (
        <p role="status" aria-live="polite" className="run-message">
          {message}
        </p>
      )}
    </div>
  );
}

export function AppOverview() {
  const { state, reload } = useDashboardContext();

  if (state.status !== 'ready') return <PageState state={state} onRetry={reload} />;
  const data = state.data;

  const statusLabel = (classified: string | null): string => {
    if (classified === null) return 'Not yet scanned';
    return classified.charAt(0).toUpperCase() + classified.slice(1);
  };

  return (
    <>
      <header className="app-header">
        <div>
          <p className="eyebrow">
            {data.brandName} · last {pluralize(data.series.length, 'observed day')}
          </p>
          <h1>Visibility overview</h1>
        </div>
        <RunScanButton data={data} onDone={reload} />
      </header>

      {data.entitlement.warning && (
        <div className="notice notice-warn" role="status">
          <b>
            {data.entitlement.warning === 'payment'
              ? 'Billing needs attention.'
              : data.entitlement.warning === 'paused'
                ? 'Subscription paused.'
                : 'Subscription ended.'}
          </b>
          <span>Historical results stay available, but new provider calls are blocked.</span>
          <Link to="/app/billing">Open billing →</Link>
        </div>
      )}

      {data.totalObservations === 0 ? (
        <div className="app-state">
          <h2>No observations yet</h2>
          <p>
            Your trial scan has not produced stored results. Run the trial scan from the prompts
            page to collect your first genuine Perplexity observation.
          </p>
          <Link className="button" to="/app/prompts">
            Go to prompts
          </Link>
        </div>
      ) : (
        <>
          <section className="dashboard" aria-label="Current visibility metrics">
            <div className="metric-strip">
              <div className="score">
                <span>Visibility score</span>
                <strong>{fmtScore(data.current.visibilityScore)}</strong>
                <small>{fmtDelta(data.delta.visibilityScore, 'score')} vs previous day</small>
              </div>
              <div>
                <span>Mention rate</span>
                <strong>{fmtPercent(data.current.mentionRate)}</strong>
                <small>{fmtDelta(data.delta.mentionRate, 'percent')} vs previous day</small>
              </div>
              <div>
                <span>Share of voice</span>
                <strong>{fmtPercent(data.current.shareOfVoice)}</strong>
                <small>{fmtDelta(data.delta.shareOfVoice, 'percent')} vs previous day</small>
              </div>
              <div>
                <span>Avg. mention position</span>
                <strong>{fmtPosition(data.current.averageMentionPosition)}</strong>
                <small>Coverage {fmtPercent(data.current.coverage)}</small>
              </div>
            </div>

            <div className="dash-grid">
              <div className="trend">
                <div className="section-heading">
                  <h3>Visibility trend</h3>
                  {data.provider && (
                    <span className="status">
                      <CircleDot size={13} aria-hidden="true" /> {data.provider.name} ·{' '}
                      {data.provider.preset ?? 'default'}
                    </span>
                  )}
                </div>
                <Trend series={data.series} />
              </div>
              <div className="share">
                <h3>Share of voice</h3>
                {data.shareOfVoiceByEntity.length === 0 ? (
                  <p className="row-meta">
                    Share of voice appears once tracked entities are mentioned in stored answers.
                  </p>
                ) : (
                  data.shareOfVoiceByEntity.map((entity) => (
                    <div className="bar-row" key={entity.key}>
                      <div>
                        <span>{entity.label}</span>
                        <b>{fmtPercent(entity.share)}</b>
                      </div>
                      <div className="bar">
                        <i style={{ width: `${String((entity.share ?? 0) * 100)}%` }} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="result-head">
              <h3>Prompt observations</h3>
              <span>
                {data.provider
                  ? `${data.provider.name} · ${data.provider.model ?? 'unknown model'}`
                  : 'No provider calls yet'}
                {data.lastSuccessfulAt
                  ? ` · last success ${formatLastSuccess(data.lastSuccessfulAt)}`
                  : ''}
              </span>
            </div>
            <div className="results">
              <div className="result-row header">
                <span>Prompt</span>
                <span>Brand status</span>
                <span>First mention</span>
              </div>
              {data.prompts.map((prompt) => (
                <div className="result-row" key={prompt.promptId}>
                  <span>{prompt.text}</span>
                  <span className={prompt.classified ?? 'absent'}>
                    {statusLabel(prompt.classified)}
                  </span>
                  <span>
                    {prompt.brandPosition === null ? '—' : `#${String(prompt.brandPosition)}`}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <p className="fine">
            Metrics are directional observations collected over time from the Perplexity Agent API.
            They are not guaranteed rankings and may differ from the Perplexity consumer
            application. Interactive charts have tabular equivalents for screen readers.
          </p>
        </>
      )}
    </>
  );
}

export function UnknownRoute() {
  return (
    <div className="app-state">
      <h1>Page not found</h1>
      <p>That application page does not exist.</p>
      <Link className="button" to="/app/overview">
        Back to overview <ArrowUpRight size={15} aria-hidden="true" />
      </Link>
    </div>
  );
}

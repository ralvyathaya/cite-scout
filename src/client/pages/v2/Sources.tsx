import { Fragment, useEffect, useState } from 'react';
import { Link, useLocation, useOutletContext, useSearchParams } from 'react-router';
import { ChevronDown, Info, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip';
import { SourceIcon, SafeSource } from '../../components/SourceIdentity';
import { EngineIcon } from '../../components/EngineIcon';
import { answerQuery } from '../../lib/answer-navigation';
import { ownershipLabels, sourceDomains, sourceHost } from '../../lib/source-data';
import { geoSurfaces, type GeoEngine, type GeoObservation } from '../../../shared/geo';
import type { GeoSourceOpportunity } from '../../../shared/geo-actions';
import type { WorkspaceContext } from './Workspace';
import { ApiError, api, useResource } from './api';
import { WorkspaceHeading } from './WorkspaceHeading';

const field = 'h-10 min-w-0 max-w-full rounded-lg border bg-card px-2 text-sm';
const cell = 'min-w-0 break-words px-3 py-2';
type AnswerCache = Map<string, Promise<GeoObservation>>;

function Engines({ engines }: { engines: GeoEngine[] }) {
  return (
    <span className="flex flex-wrap gap-2">
      {engines.map((engine) => (
        <Tooltip key={engine}>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              className="inline-flex min-h-7 items-center rounded-sm"
              aria-label={geoSurfaces[engine].label}
            >
              <EngineIcon engine={engine} />
            </span>
          </TooltipTrigger>
          <TooltipContent>{geoSurfaces[engine].label}</TooltipContent>
        </Tooltip>
      ))}
    </span>
  );
}

function SupportingAnswer({
  id,
  cache,
  to,
  returnTo,
}: {
  id: string;
  cache: AnswerCache;
  to: string;
  returnTo: string;
}) {
  const [answer, setAnswer] = useState<GeoObservation | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let closed = false;
    let request = cache.get(id);
    if (!request) {
      request = api<GeoObservation>(`/geo/observations/${encodeURIComponent(id)}`);
      cache.set(id, request);
    }
    void request
      .then((value) => {
        if (!closed) setAnswer(value);
      })
      .catch(() => {
        if (!closed) setError(true);
      });
    return () => {
      closed = true;
    };
  }, [id, cache, attempt]);
  return (
    <li className="min-w-0 rounded-lg border bg-card px-3 py-2">
      <Link
        to={to}
        state={{ returnTo }}
        className="block break-words text-sm font-medium text-primary hover:underline"
      >
        {answer?.context.promptText ?? 'Open saved answer'}
      </Link>
      {answer ? (
        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <EngineIcon engine={answer.engine} />
          {geoSurfaces[answer.engine].label} ·{' '}
          <time dateTime={answer.capturedAt}>{new Date(answer.capturedAt).toLocaleString()}</time> ·{' '}
          {answer.capture.quality === 'no_feature'
            ? 'No AI answer'
            : answer.capture.quality === 'partial'
              ? 'Partial capture'
              : 'Complete capture'}
        </p>
      ) : error ? (
        <p role="status" className="mt-1 text-xs text-muted-foreground">
          Preview unavailable. The saved answer can still be opened.{' '}
          <button
            className="min-h-7 text-primary underline"
            onClick={() => {
              cache.delete(id);
              setError(false);
              setAttempt((value) => value + 1);
            }}
          >
            Retry preview
          </button>
        </p>
      ) : (
        <p role="status" className="mt-1 text-xs text-muted-foreground">
          Loading answer preview…
        </p>
      )}
    </li>
  );
}

function SourceEvidence({
  source,
  cache,
  query,
  returnTo,
}: {
  source: GeoSourceOpportunity;
  cache: AnswerCache;
  query: string;
  returnTo: string;
}) {
  const [count, setCount] = useState(5);
  const ids = Array.from(new Set(source.observationIds));
  return (
    <div className="space-y-3 p-3 sm:p-4">
      <h3 className="text-sm font-semibold">Source evidence</h3>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span>{source.returnedResults} answers with search results</span>
        <span>{source.answerReferences} answers with references</span>
        <span>{source.inlineReferences} answers with verified inline references</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {ownershipLabels[source.role]} · Counts use eligible classified saved answers. A returned
        search result does not establish citation use.
      </p>
      <ul className="grid gap-2 md:grid-cols-2">
        {ids.slice(0, count).map((id) => (
          <SupportingAnswer
            key={id}
            id={id}
            cache={cache}
            to={`/app/observations/${encodeURIComponent(id)}?${query}`}
            returnTo={returnTo}
          />
        ))}
      </ul>
      {ids.length > count && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setCount((value) => value + 5);
          }}
        >
          Load 5 more answers
        </Button>
      )}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium">Source context</summary>
        <p className="mt-2">
          {source.observations} of {source.denominator} eligible answers in scope. Competitor
          recommendations appeared in {source.competitorCooccurrences} related answers; a direct
          relationship to this source remains unverified.
        </p>
        <p className="mt-2 break-all">Stored URL: {source.url}</p>
      </details>
    </div>
  );
}

export function GeoSources() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const { data } = useOutletContext<WorkspaceContext>();
  const view = params.get('view') === 'domains' ? 'domains' : 'pages';
  const days = ['7', '14', '30'].includes(params.get('days') ?? '')
    ? (params.get('days') ?? '7')
    : '7';
  const scope = new URLSearchParams(answerQuery(params));
  scope.delete('cursor');
  scope.set('days', days);
  const query = scope.toString();
  const sources = useResource<GeoSourceOpportunity[]>(`/geo/sources?${query}`);
  const [cache] = useState<AnswerCache>(() => new Map());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const search = params.get('q') ?? '';
  const domainFilter = params.get('domain') ?? '';
  const owner = params.get('owner') ?? 'all';
  const sort = params.get('sort') ?? (view === 'pages' ? 'referenced' : 'answers');
  const roles = Object.entries(ownershipLabels).filter(
    ([key]) => view === 'domains' || key !== 'mixed',
  );
  const matchesOwner = (role: string) => !roles.some(([key]) => key === owner) || role === owner;
  const matchesText = (source: GeoSourceOpportunity) =>
    `${source.title ?? ''} ${source.url} ${source.domain}`
      .toLowerCase()
      .includes(search.trim().toLowerCase());
  const pages = (sources.data ?? [])
    .filter(
      (source) =>
        matchesOwner(source.role) &&
        matchesText(source) &&
        (!domainFilter || sourceHost(source.url) === domainFilter),
    )
    .sort((a, b) =>
      sort === 'name'
        ? a.url.localeCompare(b.url)
        : (sort === 'answers'
            ? b.observations - a.observations
            : b.answerReferences - a.answerReferences) ||
          b.observations - a.observations ||
          a.url.localeCompare(b.url),
    );
  const domains = sourceDomains(sources.data ?? [])
    .filter(
      (domain) =>
        matchesOwner(domain.role) &&
        domain.pages.some(matchesText) &&
        (!domainFilter || domain.domain === domainFilter),
    )
    .sort((a, b) =>
      sort === 'name'
        ? a.domain.localeCompare(b.domain)
        : (sort === 'pages'
            ? b.pages.length - a.pages.length
            : b.observationIds.size - a.observationIds.size) ||
          b.pages.length - a.pages.length ||
          a.domain.localeCompare(b.domain),
    );
  const rows = view === 'pages' ? pages.length : domains.length;
  const totalPages = Math.max(1, Math.ceil(rows / 25));
  const requestedPage = Number(params.get('page') ?? 1);
  const page =
    Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, totalPages) : 1;
  const start = (page - 1) * 25;
  function update(key: string, value: string, replace = false) {
    // Rapid filter changes can precede the router's next render.
    const next = new URLSearchParams(window.location.search);
    if (!value || value === 'all' || (key === 'view' && value === 'pages')) next.delete(key);
    else next.set(key, value);
    if (key !== 'page') next.delete('page');
    if (key === 'view') next.delete('sort');
    setExpanded(null);
    setParams(next, { replace });
  }
  const moreFilters = (
    <>
      <label className="min-w-0 text-xs">
        <span className="sr-only">Engine</span>
        <select
          aria-label="Engine"
          className={field}
          value={scope.get('engine') ?? 'all'}
          onChange={(event) => {
            update('engine', event.target.value);
          }}
        >
          <option value="all">All engines</option>
          {Object.entries(geoSurfaces).map(([engine, surface]) => (
            <option key={engine} value={engine}>
              {surface.label}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-0 text-xs">
        <span className="sr-only">Prompt</span>
        <select
          aria-label="Prompt"
          className={`${field} md:max-w-48`}
          value={scope.get('promptId') ?? 'all'}
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
      <label className="min-w-0 text-xs">
        <span className="sr-only">Ownership</span>
        <select
          aria-label="Ownership"
          className={field}
          value={roles.some(([key]) => key === owner) ? owner : 'all'}
          onChange={(event) => {
            update('owner', event.target.value);
          }}
        >
          <option value="all">All owners</option>
          {roles.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-0 text-xs">
        <span className="sr-only">Sort sources</span>
        <select
          aria-label="Sort sources"
          className={field}
          value={
            ['answers', 'name', view === 'pages' ? 'referenced' : 'pages'].includes(sort)
              ? sort
              : view === 'pages'
                ? 'referenced'
                : 'answers'
          }
          onChange={(event) => {
            update('sort', event.target.value);
          }}
        >
          <option value={view === 'pages' ? 'referenced' : 'pages'}>
            {view === 'pages' ? 'Most referenced' : 'Most pages'}
          </option>
          <option value="answers">Most answers</option>
          <option value="name">{view === 'pages' ? 'Page A–Z' : 'Domain A–Z'}</option>
        </select>
      </label>
    </>
  );
  const returnTo = location.pathname + location.search;
  return (
    <section className="space-y-3">
      <WorkspaceHeading title="Sources">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="About source counts">
              <Info className="size-4" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent aria-label="About source counts" className="workspace-theme text-sm">
            Counts use complete saved answers with eligible classifications in this scope. Answers
            counts records containing a source; Referenced counts answers that link the page. Search
            results are not automatically citations. Domain answer counts are deduplicated.
          </PopoverContent>
        </Popover>
      </WorkspaceHeading>
      <nav aria-label="Sources views" className="flex gap-5 border-b text-sm">
        {['pages', 'domains'].map((tab) => {
          const next = new URLSearchParams(params);
          next.delete('page');
          next.delete('sort');
          if (tab === 'domains') next.set('view', tab);
          else next.delete('view');
          return (
            <Link
              key={tab}
              to={`/app/sources${next.size ? `?${next}` : ''}`}
              aria-current={tab === view ? 'page' : undefined}
              className={`-mb-px border-b-2 px-1 py-2.5 font-medium ${tab === view ? 'border-primary' : 'border-transparent text-muted-foreground'}`}
            >
              {tab === 'pages' ? 'Pages' : 'Domains'}
            </Link>
          );
        })}
      </nav>
      <div className="monitoring-toolbar flex flex-wrap items-center gap-2 rounded-t-xl border border-b-0 bg-card p-3">
        <label className="relative min-w-0 flex-1 basis-48">
          <Search
            className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="sr-only">Search sources</span>
          <input
            className={`${field} w-full pl-9`}
            placeholder="Search pages or domains…"
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
            value={days}
            onChange={(event) => {
              update('days', event.target.value);
            }}
          >
            {['7', '14', '30'].map((value) => (
              <option key={value} value={value}>
                Last {value} days
              </option>
            ))}
          </select>
        </label>
        <div aria-label="Sources filters" className="hidden flex-wrap gap-2 md:flex">
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
            aria-label="Sources filters"
            className="workspace-theme grid max-w-[calc(100vw-2rem)] gap-3"
          >
            {moreFilters}
          </PopoverContent>
        </Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="Refresh saved sources"
              size="icon"
              variant="ghost"
              disabled={refreshing || sources.loading}
              onClick={() => {
                setRefreshing(true);
                setExpanded(null);
                cache.clear();
                void sources.reload().finally(() => {
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
          <TooltipContent>Refresh saved sources</TooltipContent>
        </Tooltip>

        {domainFilter && (
          <span className="flex min-w-0 items-center gap-2 text-xs">
            Domain: <span className="break-all">{domainFilter}</span>
            <button
              className="min-h-8 text-primary underline"
              onClick={() => {
                update('domain', '');
              }}
            >
              Clear domain filter
            </button>
          </span>
        )}
      </div>
      <div className="overflow-hidden rounded-b-xl border bg-card">
        {sources.loading ? (
          <p role="status" className="p-4 text-sm">
            Loading saved sources…
          </p>
        ) : sources.error ? (
          <div className="space-y-2 p-4 text-sm">
            <p role="alert">
              {sources.error instanceof ApiError && sources.error.code === 'GEO_SCOPE_TOO_LARGE'
                ? 'Too many saved answers in this scope. Choose a shorter period or filter by engine or prompt.'
                : `Saved sources unavailable. ${sources.error.message}`}
            </p>
            <Button variant="outline" size="sm" onClick={() => void sources.reload()}>
              Retry saved sources
            </Button>
          </div>
        ) : !sources.data ? (
          <p role="alert" className="p-4 text-sm">
            Saved sources are unavailable. Refresh saved sources to try again.
          </p>
        ) : !rows ? (
          <p className="p-5 text-sm text-muted-foreground">
            No saved sources match this scope and filters. Incomplete or unclassified answers remain
            available in Monitoring.
          </p>
        ) : (
          <table className="sources-table w-full table-fixed text-left text-sm">
            <caption className="sr-only">
              {view === 'pages' ? 'Saved source pages' : 'Saved source domains'} in the selected
              scope
            </caption>
            <thead className="bg-muted/40">
              <tr>
                <th scope="col" className={`${cell} w-[34%]`}>
                  {view === 'pages' ? 'Page' : 'Domain'}
                </th>
                <th scope="col" className={`${cell} w-[14%]`}>
                  Ownership
                </th>
                <th scope="col" className={`${cell} w-[9%]`}>
                  {view === 'pages' ? 'Answers' : 'Pages'}
                </th>
                <th scope="col" className={`${cell} w-[11%]`}>
                  {view === 'pages' ? 'Referenced' : 'Answers'}
                </th>
                <th scope="col" className={`${cell} w-[17%]`}>
                  Engines
                </th>
                <th scope="col" className={`${cell} w-[15%]`}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {view === 'pages'
                ? pages.slice(start, start + 25).map((source) => (
                    <Fragment key={source.url}>
                      <tr className="border-t align-top hover:bg-muted/10">
                        <th scope="row" className={`${cell} font-normal`}>
                          <div className="flex min-w-0 items-start gap-2">
                            <SourceIcon url={source.url} />
                            <div className="min-w-0">
                              <SafeSource url={source.url}>
                                {source.title ?? source.domain}
                              </SafeSource>
                              <p className="mt-1 break-all text-xs text-muted-foreground">
                                {source.url.replace(/^https?:\/\//u, '')}
                              </p>
                            </div>
                          </div>
                        </th>
                        <td className={cell} data-label="Ownership">
                          <Badge variant="outline">{ownershipLabels[source.role]}</Badge>
                        </td>
                        <td className={cell} data-label="Answers">
                          {source.observations}
                        </td>
                        <td className={cell} data-label="Referenced">
                          {source.answerReferences}
                        </td>
                        <td className={cell} data-label="Engines">
                          <Engines engines={source.engines} />
                        </td>
                        <td className={cell}>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-expanded={expanded === source.url}
                            aria-controls={`source-${encodeURIComponent(source.url)}`}
                            onClick={() => {
                              setExpanded(expanded === source.url ? null : source.url);
                            }}
                          >
                            <ChevronDown
                              className={`size-4 ${expanded === source.url ? 'rotate-180' : ''}`}
                              aria-hidden="true"
                            />
                            View evidence
                          </Button>
                        </td>
                      </tr>
                      {expanded === source.url && (
                        <tr className="source-evidence border-t bg-muted/15">
                          <td colSpan={6} id={`source-${encodeURIComponent(source.url)}`}>
                            <SourceEvidence
                              source={source}
                              cache={cache}
                              query={query}
                              returnTo={returnTo}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                : domains.slice(start, start + 25).map((domain) => {
                    const next = new URLSearchParams(params);
                    next.delete('view');
                    next.delete('page');
                    next.delete('sort');
                    next.set('domain', domain.domain);
                    if (owner === 'mixed') next.delete('owner');
                    return (
                      <tr key={domain.domain} className="border-t align-top hover:bg-muted/10">
                        <th scope="row" className={`${cell} font-medium`}>
                          <Link
                            className="flex min-w-0 items-center gap-2 hover:text-primary"
                            to={`/app/sources?${next}`}
                          >
                            <SourceIcon url={`https://${domain.domain}`} />
                            <span className="break-all">{domain.domain}</span>
                          </Link>
                        </th>
                        <td className={cell} data-label="Ownership">
                          <Badge variant="outline">{ownershipLabels[domain.role]}</Badge>
                        </td>
                        <td className={cell} data-label="Pages">
                          {domain.pages.length}
                        </td>
                        <td className={cell} data-label="Answers">
                          {domain.observationIds.size}
                        </td>
                        <td className={cell} data-label="Engines">
                          <Engines engines={Array.from(domain.engines)} />
                        </td>
                        <td className={cell}>
                          <Button asChild size="sm" variant="ghost">
                            <Link to={`/app/sources?${next}`}>View pages</Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        )}
      </div>
      {sources.data && !sources.error && (
        <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {rows ? start + 1 : 0}–{Math.min(start + 25, rows)} of {rows} {view} · eligible saved
            answers
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
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
                variant="outline"
                size="sm"
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

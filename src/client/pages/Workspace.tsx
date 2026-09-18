import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { PageState } from './AppShell';
import { useDashboardContext } from './dashboard-context';
import { usePageTitle } from '../use-page-title';

const RECOMMENDED = 'recommended';
const MENTIONED = 'mentioned';
const NEGATIVE = 'negative';
const ABSENT = 'absent';

function classificationClass(value: string | null): string {
  if (value === RECOMMENDED || value === MENTIONED || value === NEGATIVE || value === ABSENT)
    return value;
  return 'unknown';
}

function classificationLabel(value: string | null): string {
  if (value === null) return 'Not yet scanned';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

interface PromptRow {
  id: string;
  text: string;
  enabled: boolean;
}

function usePrompts() {
  const [rows, setRows] = useState<PromptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/prompts');
    if (!response.ok) {
      setError('Could not load prompts. Check your connection and try again.');
      setLoading(false);
      return;
    }
    const body = (await response.json()) as { data: PromptRow[] };
    setRows(body.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => {
      clearTimeout(timer);
    };
  }, [load]);

  return { rows, loading, error, setError, load };
}

export function PromptsPage() {
  const dashboard = useDashboardContext();
  usePageTitle('Prompts');
  const list = usePrompts();
  const [newText, setNewText] = useState('');
  const [busy, setBusy] = useState(false);
  const [trialBusy, setTrialBusy] = useState(false);
  const [trialMessage, setTrialMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const reload = dashboard.reload;
  const state = dashboard.state;

  if (state.status !== 'ready') return <PageState state={state} onRetry={reload} />;
  const data = state.data;

  const scannedToday = new Set(
    data.prompts
      .filter((prompt) => prompt.observationDate === data.observationDate)
      .map((prompt) => prompt.promptId),
  );
  const trialAvailable = data.totalObservations === 0;

  return (
    <>
      <header className="app-header">
        <div>
          <p className="eyebrow">
            {String(data.prompts.length)}/10 enabled ·{' '}
            {data.entitlement.canScan ? 'monitoring active' : 'read-only'}
          </p>
          <h1>Monitored prompts</h1>
        </div>
      </header>

      {trialAvailable && (
        <div className="notice">
          <b>One lifetime trial scan is available.</b>
          <span>It covers up to three prompts and is consumed once the provider is contacted.</span>
          <button
            type="button"
            className="link-button"
            disabled={trialBusy || data.prompts.length === 0}
            onClick={() => {
              setTrialBusy(true);
              setTrialMessage('');
              void fetch('/api/scans/trial', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  projectId: data.projectId,
                  promptIds: data.prompts.slice(0, 3).map((prompt) => prompt.promptId),
                }),
              })
                .then(async (response) => {
                  const body = (await response.json()) as {
                    data?: { successful: number; failed: number };
                    error?: { message: string };
                  };
                  setTrialMessage(
                    response.ok
                      ? `Trial complete: ${String(body.data?.successful ?? 0)} observed, ${String(body.data?.failed ?? 0)} failed.`
                      : (body.error?.message ?? 'Trial scan failed.'),
                  );
                  if (response.ok) reload();
                })
                .catch(() => {
                  setTrialMessage('Network error while running the trial scan.');
                })
                .finally(() => {
                  setTrialBusy(false);
                });
            }}
          >
            <span aria-hidden="true">▸ </span>
            {trialBusy ? 'Running trial scan…' : 'Run one-time trial scan'}
          </button>
        </div>
      )}
      {trialMessage && (
        <p role="status" aria-live="polite" className="form-status">
          {trialMessage}
        </p>
      )}

      <section className="settings-panel">
        <h2>Add a prompt</h2>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            list.setError('');
            void fetch('/api/prompts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: newText }),
            })
              .then(async (response) => {
                if (!response.ok) {
                  const body = (await response.json()) as { error?: { message: string } };
                  list.setError(body.error?.message ?? 'Could not add the prompt.');
                  return;
                }
                setNewText('');
                await list.load();
                reload();
              })
              .catch(() => {
                list.setError('Network error while adding the prompt.');
              })
              .finally(() => {
                setBusy(false);
              });
          }}
        >
          <label htmlFor="new-prompt">
            Buyer-style question
            <input
              id="new-prompt"
              value={newText}
              minLength={10}
              maxLength={500}
              required
              placeholder="What is the best scheduling tool for independent consultants?"
              onChange={(event) => {
                setNewText(event.target.value);
              }}
            />
          </label>
          <button className="button" disabled={busy}>
            Add prompt
          </button>
        </form>
        {list.error && (
          <p role="alert" className="form-error">
            {list.error}
          </p>
        )}
      </section>

      <section className="settings-panel">
        <h2>Configured prompts</h2>
        {list.loading ? (
          <p role="status">Loading prompts…</p>
        ) : list.rows.length === 0 ? (
          <p>No prompts yet. Add between three and ten buyer-style questions.</p>
        ) : (
          list.rows.map((row) => {
            const promptState = data.prompts.find((prompt) => prompt.promptId === row.id);
            return (
              <div className="setting-row" key={row.id}>
                <span>
                  {row.text}
                  <small className="row-meta">
                    {classificationLabel(promptState?.classified ?? null)}
                    {scannedToday.has(row.id) ? ' · observed today' : ''}
                    {row.enabled ? '' : ' · disabled'}
                  </small>
                </span>
                <span className="row-actions">
                  <button
                    type="button"
                    onClick={() => {
                      void fetch(`/api/prompts/${row.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ enabled: !row.enabled }),
                      })
                        .then(async (response) => {
                          if (!response.ok) {
                            const body = (await response.json()) as { error?: { message: string } };
                            list.setError(body.error?.message ?? 'Could not update the prompt.');
                            return;
                          }
                          await list.load();
                        })
                        .catch(() => {
                          list.setError('Network error while updating the prompt.');
                        });
                    }}
                  >
                    {row.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDelete(row.id);
                    }}
                  >
                    Delete
                  </button>
                </span>
                {confirmDelete === row.id && (
                  <div className="confirm-inline" role="alertdialog" aria-label="Confirm deletion">
                    <span>
                      Delete this prompt? Its stored history is removed too. This cannot be undone.
                    </span>
                    <span className="row-actions">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDelete(null);
                          void fetch(`/api/prompts/${row.id}`, { method: 'DELETE' })
                            .then(async (response) => {
                              if (!response.ok) {
                                const body = (await response.json()) as {
                                  error?: { message: string };
                                };
                                list.setError(
                                  body.error?.message ?? 'Could not delete the prompt.',
                                );
                                return;
                              }
                              await list.load();
                              reload();
                            })
                            .catch(() => {
                              list.setError('Network error while deleting the prompt.');
                            });
                        }}
                      >
                        Yes, delete
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDelete(null);
                        }}
                      >
                        Cancel
                      </button>
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
        <p className="fine">
          Changes take effect on the next scan. Prompts already observed today are skipped so a
          single UTC day never bills twice for the same prompt.
        </p>
      </section>
    </>
  );
}

interface ResponseRow {
  id: string;
  promptId: string;
  promptText: string;
  observationDate: string;
  brandPosition: number | null;
  contextClassification: string;
  provider: string;
  providerModel: string | null;
  providerPreset: string | null;
  providerRequestId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  rawResponseText: string | null;
  citationDataJson: string | null;
  matchedTermsJson: string;
  errorCode: string | null;
}

interface Citation {
  id: number;
  url: string;
  title: string | null;
}

function parseCitationData(json: string | null): Citation[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (typeof item !== 'object' || item === null) return [];
      const record = item as Record<string, unknown>;
      const rawUrl: unknown = record.url;
      if (typeof rawUrl !== 'string' || !rawUrl.startsWith('https://')) return [];
      const rawId: unknown = record.id;
      const rawTitle: unknown = record.title;
      return [
        {
          id: typeof rawId === 'number' ? rawId : 0,
          url: rawUrl,
          title: typeof rawTitle === 'string' ? rawTitle : null,
        },
      ];
    });
  } catch {
    return [];
  }
}

function parseTerms(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function highlight(text: string, terms: string[]): { text: string; marked: boolean }[] {
  const usable = terms.filter((term) => term.trim().length > 1);
  if (usable.length === 0) return [{ text, marked: false }];
  const pattern = new RegExp(
    `(${usable.map((term) => term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('|')})`,
    'giu',
  );
  return text.split(pattern).map((part, index) => ({ text: part, marked: index % 2 === 1 }));
}

interface ArchiveResponse {
  items: ResponseRow[];
  hasMore: boolean;
  nextCursor: string | null;
}

export function ResponsesPage() {
  const dashboard = useDashboardContext();
  usePageTitle('Responses');
  const [page, setPage] = useState<ArchiveResponse | null>(null);
  const [extra, setExtra] = useState<ResponseRow[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const ready = dashboard.state.status === 'ready';

  const load = useCallback(async (before: string | null, append: boolean) => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch(
        `/api/dashboard/responses?limit=10${before === null ? '' : `&before=${before}`}`,
      );
      if (!response.ok) {
        setLoadError(true);
        return;
      }
      const body = (await response.json()) as { data: ArchiveResponse };
      setPage(body.data);
      if (append) setExtra((current) => [...current, ...body.data.items]);
      else setExtra([]);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      void load(null, false);
    }, 0);
    return () => {
      clearTimeout(timer);
    };
  }, [ready, load]);

  if (!ready) return <PageState state={dashboard.state} onRetry={dashboard.reload} />;

  const items = extra.length > 0 ? extra : (page?.items ?? []);

  return (
    <>
      <header className="app-header">
        <div>
          <p className="eyebrow">Auditable archive · newest first</p>
          <h1>Response archive</h1>
        </div>
      </header>

      {loading && items.length === 0 ? (
        <p role="status">Loading stored responses…</p>
      ) : loadError && items.length === 0 ? (
        <div className="app-state">
          <h2>Could not load responses</h2>
          <p>Check your connection and try again. Stored answers are not affected.</p>
          <button
            type="button"
            className="button"
            onClick={() => {
              void load(null, false);
            }}
          >
            Retry
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="app-state">
          <h2>No stored responses yet</h2>
          <p>Run the trial scan to collect the first genuine provider answer.</p>
          <Link className="button" to="/app/prompts">
            Go to prompts
          </Link>
        </div>
      ) : (
        <section className="archive" aria-label="Stored provider responses">
          {items.map((row) => {
            const citations = parseCitationData(row.citationDataJson);
            const terms = parseTerms(row.matchedTermsJson);
            const expanded = open === row.id;
            return (
              <article className="archive-row" key={row.id}>
                <div className="archive-head">
                  <div>
                    <p className="archive-prompt">{row.promptText}</p>
                    <p className="row-meta">
                      {row.observationDate} · {row.provider} ·{' '}
                      {row.providerModel ?? 'unknown model'}
                      {row.providerPreset === null ? '' : ` · ${row.providerPreset}`}
                      {row.inputTokens === null ? '' : ` · ${String(row.inputTokens)} in`}
                      {row.outputTokens === null ? '' : ` / ${String(row.outputTokens)} out`}
                    </p>
                  </div>
                  <span className={classificationClass(row.contextClassification)}>
                    {classificationLabel(row.contextClassification)}
                  </span>
                </div>

                <p className="row-meta">
                  Brand position{' '}
                  {row.brandPosition === null ? '—' : `#${String(row.brandPosition)}`}
                  {row.providerRequestId === null ? '' : ` · request ${row.providerRequestId}`}
                </p>

                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => {
                    setOpen(expanded ? null : row.id);
                  }}
                >
                  {expanded ? 'Hide raw answer' : 'Inspect raw answer and citations'}
                </button>

                {expanded && (
                  <div className="archive-detail">
                    {row.errorCode === null ? (
                      <p className="raw-answer">
                        {highlight(row.rawResponseText ?? '', terms).map((part, index) =>
                          part.marked ? (
                            <mark key={index}>{part.text}</mark>
                          ) : (
                            <span key={index}>{part.text}</span>
                          ),
                        )}
                      </p>
                    ) : (
                      <p role="alert" className="form-error">
                        Provider error recorded: {row.errorCode}. No answer text was stored.
                      </p>
                    )}
                    <h4>Citations</h4>
                    {citations.length === 0 ? (
                      <p className="row-meta">No citations were returned for this answer.</p>
                    ) : (
                      <ol className="citation-list">
                        {citations.map((citation) => (
                          <li key={`${String(citation.id)}-${citation.url}`}>
                            <a href={citation.url} target="_blank" rel="noreferrer noopener">
                              {citation.title ?? citation.url}
                            </a>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </article>
            );
          })}
          {(page?.hasMore ?? false) && (
            <button
              type="button"
              className="button"
              disabled={loading}
              onClick={() => {
                void load(page?.nextCursor ?? null, true);
              }}
            >
              {loading ? 'Loading…' : 'Load older responses'}
            </button>
          )}
        </section>
      )}
    </>
  );
}

import { FileText, ListChecks, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { DomainIcon } from '@/client/components/brand-icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/client/components/ui/alert-dialog';
import { Button } from '@/client/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/client/components/ui/card';
import { Input } from '@/client/components/ui/input';
import { Label } from '@/client/components/ui/label';
import { Skeleton } from '@/client/components/ui/skeleton';
import { Switch } from '@/client/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/client/components/ui/table';
import { ObservationSignal } from '@/client/components/status-badge';
import { ScanAction } from '@/client/components/scan-action';
import { returnedSources, type ObservationInsight } from '@/domain/insights';
import { usePageTitle } from '@/client/use-page-title';
import { PageState } from './AppShell';
import { useDashboardContext } from './dashboard-context';

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
    setError('');
    try {
      const response = await fetch('/api/prompts');
      if (!response.ok) throw new Error('Could not load prompts.');
      const body = (await response.json()) as { data: PromptRow[] };
      setRows(body.data);
    } catch {
      setError('Could not load prompts. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
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
  const [deleting, setDeleting] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [deleteError, setDeleteError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<PromptRow | null>(null);

  const reload = dashboard.reload;
  const state = dashboard.state;

  if (state.status === 'onboarding') {
    return (
      <div className="p-6 lg:p-8">
        <div className="mb-6">
          <p className="text-sm text-muted-foreground">
            Buyer-intent prompts · Perplexity monitoring
          </p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight">Tracked Prompts</h1>
        </div>
        <Card className="mx-auto max-w-xl text-center">
          <CardHeader>
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
              <ListChecks className="size-6 text-muted-foreground" />
            </div>
            <CardTitle className="mt-3 text-lg">
              Define your brand to start tracking prompts
            </CardTitle>
            <CardDescription>
              CiteScout needs your brand name and competitors to measure visibility and citation
              rates across search prompts.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/app/onboarding">Complete project setup (2 min) →</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state.status !== 'ready') return <PageState state={state} onRetry={reload} />;
  const data = state.data;

  const scannedToday = new Set(
    data.prompts
      .filter((prompt) => prompt.observationDate === data.observationDate)
      .map((prompt) => prompt.promptId),
  );

  async function confirmDelete() {
    if (deleteTarget === null) return;
    const target = deleteTarget;
    setDeleting(true);
    setDeleteError('');
    try {
      const response = await fetch(`/api/prompts/${target.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message: string } };
        setDeleteError(body.error?.message ?? 'Could not delete the prompt.');
        toast.error(body.error?.message ?? 'Could not delete the prompt.');
        return;
      }
      setDeleteTarget(null);
      toast.success('Prompt deleted.');
      document.getElementById('new-prompt')?.focus();
      await list.load();
      reload();
    } catch {
      setDeleteError('Network error while deleting the prompt.');
      toast.error('Network error while deleting the prompt.');
    } finally {
      setDeleting(false);
    }
  }

  async function togglePrompt(row: PromptRow) {
    setPendingIds((ids) => [...ids, row.id]);
    try {
      const response = await fetch(`/api/prompts/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !row.enabled }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message: string } };
        toast.error(body.error?.message ?? 'Could not update the prompt.');
        return;
      }
      await list.load();
      reload();
      toast.success(row.enabled ? 'Prompt disabled.' : 'Prompt enabled.');
    } catch {
      toast.error('Network error while updating the prompt.');
    } finally {
      setPendingIds((ids) => ids.filter((id) => id !== row.id));
    }
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">
          {String(list.rows.filter((row) => row.enabled).length)}/10 enabled ·{' '}
          {data.entitlement.canScan ? 'monitoring active' : 'read-only'}
        </p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight">Monitored prompts</h1>
      </div>

      <div className="mb-6">
        <ScanAction data={data} onDone={reload} />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Add a prompt</CardTitle>
          <CardDescription>A buyer-style question asked to an AI assistant.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
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
                    toast.error(body.error?.message ?? 'Could not add the prompt.');
                    return;
                  }
                  toast.success('Prompt added.');
                  setNewText('');
                  await list.load();
                  reload();
                })
                .catch(() => {
                  toast.error('Network error while adding the prompt.');
                })
                .finally(() => {
                  setBusy(false);
                });
            }}
          >
            <div className="grid flex-1 gap-2">
              <Label htmlFor="new-prompt" className="sr-only">
                Buyer-style question
              </Label>
              <Input
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
            </div>
            <Button type="submit" disabled={busy}>
              <Plus className="size-4" aria-hidden="true" />
              Add prompt
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <div className="border-b px-5 py-3.5">
          <h2 className="text-base font-semibold">Configured prompts</h2>
        </div>
        {list.loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-10" />
            ))}
          </div>
        ) : list.rows.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            No prompts yet. Add between three and ten buyer-style questions.
          </p>
        ) : (
          <Table className="observation-table" aria-label="Tracked prompts">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Prompt</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20 text-center">Enabled</TableHead>
                <TableHead className="w-24 pr-5 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.rows.map((row) => {
                const promptState = data.prompts.find((prompt) => prompt.promptId === row.id);
                return (
                  <TableRow key={row.id}>
                    <TableCell className="max-w-md pl-5">
                      <span className="block min-w-40 whitespace-normal wrap-anywhere">
                        {row.text}
                      </span>
                      {promptState?.observationId && (
                        <Link
                          className="mt-1 block text-xs underline underline-offset-4"
                          to={`/app/responses?observation=${encodeURIComponent(promptState.observationId)}`}
                        >
                          View evidence · {promptState.observationDate}
                        </Link>
                      )}
                      {scannedToday.has(row.id) && (
                        <span className="text-xs text-muted-foreground"> · observed today</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <ObservationSignal
                        insight={
                          promptState?.insight ?? {
                            status: 'unknown',
                            context: 'unknown',
                            displacedCompetitors: [],
                            explanation: null,
                          }
                        }
                        attemptStatus={promptState?.attemptStatus}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="mr-2 text-xs text-muted-foreground sm:hidden">Enabled</span>
                      <Switch
                        checked={row.enabled}
                        disabled={pendingIds.includes(row.id)}
                        aria-busy={pendingIds.includes(row.id)}
                        aria-label={row.enabled ? `Disable ${row.text}` : `Enable ${row.text}`}
                        onCheckedChange={() => {
                          void togglePrompt(row);
                        }}
                      />
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          setDeleteError('');
                          setDeleteTarget(row);
                        }}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <p className="border-t px-5 py-3 text-xs text-muted-foreground">
          Changes take effect on the next scan. Prompts already observed today are skipped so a
          single UTC day never bills twice for the same prompt.
        </p>
      </Card>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this prompt?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleteTarget?.text}&rdquo; and its stored history will be removed. This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleting}
              aria-busy={deleting}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting ? 'Deleting…' : 'Delete prompt'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface ResponseRow {
  insight: ObservationInsight;
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
  const [params] = useSearchParams();
  const observationId = params.get('observation');
  const [selected, setSelected] = useState<ResponseRow | null>(null);
  const [selectionError, setSelectionError] = useState('');
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
        `/api/dashboard/responses?limit=10${before === null ? '' : `&before=${encodeURIComponent(before)}`}`,
      );
      if (!response.ok) {
        setLoadError(true);
        return;
      }
      const body = (await response.json()) as { data: ArchiveResponse };
      setPage(body.data);
      setExtra((current) =>
        append
          ? [...new Map([...current, ...body.data.items].map((item) => [item.id, item])).values()]
          : body.data.items,
      );
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

  useEffect(() => {
    if (!ready || !observationId) return;
    const controller = new AbortController();
    void fetch(`/api/dashboard/responses/${encodeURIComponent(observationId)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('That response is unavailable or was deleted.');
        const body = (await response.json()) as { data: ResponseRow };
        if (!controller.signal.aborted) {
          setSelected(body.data);
          setOpen(body.data.id);
          setSelectionError('');
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setSelectionError(
            error instanceof Error ? error.message : 'Could not load the selected answer.',
          );
      });
    return () => {
      controller.abort();
    };
  }, [ready, observationId]);
  useEffect(() => {
    if (selected?.id === observationId) document.getElementById(`answer-${selected.id}`)?.focus();
  }, [selected, observationId]);

  if (dashboard.state.status === 'onboarding') {
    return (
      <div className="p-6 lg:p-8">
        <div className="mb-6">
          <p className="text-sm text-muted-foreground">Auditable archive · newest first</p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight">Response archive</h1>
        </div>
        <Card className="mx-auto max-w-xl text-center">
          <CardHeader>
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
              <FileText className="size-6 text-muted-foreground" />
            </div>
            <CardTitle className="mt-3 text-lg">No responses archived yet</CardTitle>
            <CardDescription>
              Raw Perplexity answers, first-mention positions, and returned sources will be archived
              here once your initial project setup is complete.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/app/onboarding">Complete setup to run trial scan →</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!ready) return <PageState state={dashboard.state} onRetry={dashboard.reload} />;

  const items =
    selected?.id === observationId
      ? [selected, ...extra.filter((item) => item.id !== selected.id)]
      : extra;

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">Auditable archive · newest first</p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight">Response archive</h1>
      </div>

      {selectionError && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {selectionError}
        </p>
      )}
      {loadError && items.length > 0 && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          Could not load older responses. Your current results are retained; try again.
        </p>
      )}
      {loading && items.length === 0 ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-32" />
          ))}
        </div>
      ) : loadError && items.length === 0 ? (
        <Card className="mx-auto max-w-md text-center">
          <CardHeader>
            <CardTitle>Could not load responses</CardTitle>
            <CardDescription>
              Check your connection and try again. Stored answers are not affected.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => {
                void load(null, false);
              }}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card className="mx-auto max-w-md text-center">
          <CardHeader>
            <CardTitle>No stored responses yet</CardTitle>
            <CardDescription>
              Run an available scan from your prompts to collect a genuine provider answer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/app/prompts">Go to prompts</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4" aria-label="Stored provider responses">
          {items.map((row) => {
            const citations = returnedSources(row.citationDataJson);
            const terms = parseTerms(row.matchedTermsJson);
            const expanded = open === row.id;
            return (
              <Card
                key={row.id}
                id={`answer-${row.id}`}
                tabIndex={-1}
                className="gap-0 py-0 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug">{row.promptText}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.observationDate} · {row.provider} ·{' '}
                      {row.providerModel ?? 'unknown model'}
                      {row.providerPreset === null ? '' : ` · ${row.providerPreset}`}
                      {row.inputTokens === null ? '' : ` · ${String(row.inputTokens)} in`}
                      {row.outputTokens === null ? '' : ` / ${String(row.outputTokens)} out`}
                    </p>
                  </div>
                  <ObservationSignal insight={row.insight} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-4 pt-2">
                  <p className="min-w-0 wrap-anywhere text-xs text-muted-foreground">
                    First-mention position{' '}
                    {row.brandPosition === null ? '—' : `#${String(row.brandPosition)}`}
                    {row.providerRequestId === null ? '' : ` · request ${row.providerRequestId}`}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-expanded={expanded}
                    className="h-auto max-w-full whitespace-normal text-left"
                    onClick={() => {
                      setOpen(expanded ? null : row.id);
                    }}
                  >
                    {expanded ? 'Hide raw answer' : 'Inspect raw answer and returned sources'}
                  </Button>
                </div>

                {expanded && (
                  <div className="border-t px-5 py-4">
                    {row.errorCode === null ? (
                      <p className="whitespace-pre-wrap wrap-anywhere text-sm leading-relaxed">
                        {highlight(row.rawResponseText ?? '', terms).map((part, index) =>
                          part.marked ? (
                            <mark
                              key={index}
                              className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground"
                            >
                              {part.text}
                            </mark>
                          ) : (
                            <span key={index}>{part.text}</span>
                          ),
                        )}
                      </p>
                    ) : (
                      <p role="alert" className="text-sm text-destructive">
                        Provider error recorded: {row.errorCode}. No answer text was stored.
                      </p>
                    )}
                    <h3 className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Returned sources
                    </h3>
                    {citations.length === 0 ? (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        No sources were returned for this answer.
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-2 text-sm">
                        {citations.map((citation) => {
                          return (
                            <li
                              key={`${String(citation.id)}-${citation.url}`}
                              className="flex items-center gap-2.5 rounded-md border bg-muted/20 px-3 py-2 text-xs sm:text-sm"
                            >
                              <span className="flex size-6 shrink-0 items-center justify-center rounded bg-muted">
                                <DomainIcon
                                  url={citation.url}
                                  className="size-3.5 text-foreground/70"
                                />
                              </span>
                              <div className="min-w-0 flex-1">
                                <a
                                  href={citation.url}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  className="block truncate font-medium text-foreground underline-offset-4 hover:underline"
                                >
                                  {citation.title ?? citation.url}
                                </a>
                                <p className="truncate text-[11px] text-muted-foreground">
                                  {citation.url}
                                </p>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
          {(page?.hasMore ?? false) && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                disabled={loading}
                onClick={() => {
                  void load(page?.nextCursor ?? null, true);
                }}
              >
                {loading ? 'Loading…' : 'Load older responses'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

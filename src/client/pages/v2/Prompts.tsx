import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router';
import {
  ChevronDown,
  FolderOpen,
  ListChecks,
  MoreHorizontal,
  Plus,
  Search,
  Info,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '../../components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip';
import { EngineIcon } from '../../components/EngineIcon';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { api, useResource } from './api';
import { GeoMonitor } from './GeoWorkspace';
import { WorkspaceHeading } from './WorkspaceHeading';
import { ActiveFilters, ChoiceButtons, ChoiceList, WorkspaceModal } from './WorkspaceControls';
import type { WorkspaceContext } from './Workspace';
import {
  geoSurfaces,
  type GeoEngine,
  type GeoObservation,
  type GeoObservationPage,
  type GeoPromptSet,
  type GeoSettings,
} from '../../../shared/geo';
import type { V2Question } from '../../../shared/v2';

const time = (value: string) =>
  new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const status = (prompt: V2Question) =>
  prompt.archivedAt ? 'Archived' : prompt.enabled ? 'Active' : 'Paused';

function EngineLink({
  engine,
  promptId,
  observation,
  loading,
  error,
}: {
  engine: GeoEngine;
  promptId: string;
  observation?: GeoObservation;
  loading: boolean;
  error: boolean;
}) {
  const label = geoSurfaces[engine].label;
  const quality =
    observation?.capture.quality === 'no_feature'
      ? 'No AI answer returned'
      : observation?.capture.quality === 'partial'
        ? 'Partial capture'
        : 'Complete capture';
  const description = observation
    ? `${label} · ${quality} · ${time(observation.capturedAt)}`
    : `${label} · ${loading ? 'Loading saved captures' : error ? 'Saved captures unavailable' : 'No capture loaded'}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          aria-label={description}
          data-capture={
            observation ? 'saved' : loading ? 'loading' : error ? 'unavailable' : 'not-loaded'
          }
          className="flex size-9 shrink-0 items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-primary"
          to={
            observation
              ? `/app/observations/${encodeURIComponent(observation.id)}`
              : `/app/observations?promptId=${encodeURIComponent(promptId)}&engine=${engine}&days=30`
          }
        >
          <EngineIcon engine={engine} className={observation ? '' : 'opacity-35'} />
        </Link>
      </TooltipTrigger>
      <TooltipContent className="workspace-theme max-w-64">{description}</TooltipContent>
    </Tooltip>
  );
}

export function PromptWorkspace({
  legacy,
  settings,
  legacyMonitor,
  notice,
  onChange,
}: {
  legacy: ReactNode;
  settings: ReturnType<typeof useResource<GeoSettings>>;
  legacyMonitor: ReactNode;
  notice: ReactNode;
  onChange: () => Promise<void>;
}) {
  const context = useOutletContext<WorkspaceContext>();
  const { data } = context;
  const groups = useResource<GeoPromptSet[]>('/geo/prompt-sets');
  const observations = useResource<GeoObservationPage>('/geo/observations?days=30');
  const [older, setOlder] = useState<GeoObservationPage | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const captureGeneration = useRef(0);
  useEffect(
    () => () => {
      captureGeneration.current++;
    },
    [],
  );
  const [error, setError] = useState<Error | null>(null);
  const [captureError, setCaptureError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const filterValue = params.get('status') ?? 'Active';
  const filter = ['Active', 'Paused', 'Archived', 'All'].includes(filterValue)
    ? filterValue
    : 'Active';
  const groupFilter = params.get('group') ?? 'all';
  const groupBy = params.get('groupBy') === 'group' ? 'group' : 'none';
  function updateFilters(values: Record<string, string>, replace = false) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (
        !value ||
        (key === 'status' && value === 'Active') ||
        (key === 'group' && value === 'all') ||
        (key === 'groupBy' && value === 'none')
      )
        next.delete(key);
      else next.set(key, value);
    }
    next.delete('cursor');
    setParams(next, { replace });
  }
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState({ group: 'all', groupBy: 'none' });
  const [scopeOpen, setScopeOpen] = useState(false);
  const [draftScope, setDraftScope] = useState('all');
  const [manageOpen, setManageOpen] = useState(false);
  const [monitorSet, setMonitorSet] = useState('all');
  const [promptOpen, setPromptOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const groupReturnFocus = useRef<HTMLElement | null>(null);
  const groupCreateTrigger = useRef<HTMLButtonElement | null>(null);
  const [editing, setEditing] = useState<GeoPromptSet | null>(null);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [promptIds, setPromptIds] = useState<string[]>([]);
  const prompts = data.project?.questions ?? [];
  const active = prompts.filter((prompt) => prompt.enabled && !prompt.archivedAt);
  const promptLimit = data.promptLimit ?? data.plan?.promptLimit;
  const atLimit = promptLimit !== undefined && active.length >= promptLimit;
  const overLimit = promptLimit !== undefined && active.length > promptLimit;
  const captures = [...(observations.data?.observations ?? []), ...(older?.observations ?? [])];
  const nextCursor = older ? older.nextCursor : observations.data?.nextCursor;
  const selectedSet = groups.data?.find((group) => group.id === monitorSet);
  const showGroups = groups.data?.length !== 0 || Boolean(groups.error);
  const locked = ['baseline', 'waiting', 'followup'].includes(data.trial?.state ?? '');
  const retired = promptIds.filter((id) => !active.some((prompt) => prompt.id === id));
  const visible = prompts.filter(
    (prompt) =>
      (filter === 'All' || status(prompt) === filter) &&
      prompt.text.toLowerCase().includes(search.trim().toLowerCase()) &&
      (groupFilter === 'all' ||
        (groupFilter === 'ungrouped'
          ? !groups.data?.some((group) => group.promptIds.includes(prompt.id))
          : groups.data?.some(
              (group) => group.id === groupFilter && group.promptIds.includes(prompt.id),
            ))),
  );
  const sections =
    !showGroups || groupBy === 'none'
      ? [{ id: 'all', name: '', rows: visible }]
      : [
          ...(groups.data ?? [])
            .filter((group) => groupFilter === 'all' || groupFilter === group.id)
            .map((group) => ({
              ...group,
              rows: visible.filter((prompt) => group.promptIds.includes(prompt.id)),
            })),
          {
            id: 'ungrouped',
            name: 'Ungrouped',
            rows: visible.filter(
              (prompt) => !groups.data?.some((group) => group.promptIds.includes(prompt.id)),
            ),
          },
        ].filter((section) => section.rows.length);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  async function mutate(work: () => Promise<unknown>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try {
      await work();
      await onChange();
    } catch (reason) {
      setError(reason instanceof Error ? reason : new Error('Could not save changes.'));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function refreshCaptures() {
    captureGeneration.current++;
    setOlder(null);
    setLoadingMore(false);
    setCaptureError(null);
    await observations.reload();
  }
  function editGroup(group: GeoPromptSet | null) {
    groupReturnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditing(group);
    setName(group?.name ?? '');
    setPromptIds(group?.promptIds ?? []);
    setError(null);
    setManageOpen(false);
    setGroupOpen(true);
  }
  const actions = (
    <div className="flex flex-wrap gap-2">
      <Dialog
        open={promptOpen}
        onOpenChange={(open) => {
          if (open || !pending.current) setPromptOpen(open);
        }}
      >
        {data.canScan && (
          <DialogTrigger asChild>
            <Button
              variant="outline"
              disabled={atLimit}
              aria-describedby={atLimit ? 'prompt-limit-note' : undefined}
            >
              <Plus aria-hidden="true" className="size-4" />
              Add prompt
            </Button>
          </DialogTrigger>
        )}
        <DialogContent className="workspace-theme workspace-modal flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden bg-card p-0 sm:max-w-[560px]">
          <header className="shrink-0 space-y-1 border-b px-5 py-4 pr-14">
            <DialogTitle>Add prompt</DialogTitle>
            <DialogDescription>
              {promptLimit === undefined
                ? 'Your verified plan determines the active prompt limit.'
                : `Your plan allows ${String(promptLimit)} active prompts.`}{' '}
              New prompts join the next UTC day's checks.
            </DialogDescription>
          </header>
          <form
            className="flex min-h-0 flex-col overflow-hidden"
            onSubmit={(event) => {
              event.preventDefault();
              void mutate(async () => {
                await api('/questions', { text });
                setText('');
                setPromptOpen(false);
              });
            }}
          >
            <div className="min-h-0 space-y-4 overflow-y-auto p-5">
              <label className="block space-y-2 text-sm">
                Prompt
                <Textarea
                  required
                  minLength={10}
                  maxLength={500}
                  value={text}
                  onChange={(event) => {
                    setText(event.target.value);
                  }}
                />
              </label>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error.message}
                </p>
              )}
            </div>
            <footer className="flex shrink-0 justify-end border-t px-5 py-4">
              <Button disabled={busy}>Save prompt</Button>
            </footer>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={groupOpen}
        onOpenChange={(open) => {
          if (open || !pending.current) setGroupOpen(open);
        }}
      >
        {data.canScan && (
          <DialogTrigger asChild>
            <Button
              variant="outline"
              ref={groupCreateTrigger}
              onClick={() => {
                editGroup(null);
              }}
            >
              <FolderOpen aria-hidden="true" className="size-4" />
              Create group
            </Button>
          </DialogTrigger>
        )}
        <DialogContent
          className="workspace-theme workspace-modal flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden bg-card p-0 sm:max-w-[560px]"
          onCloseAutoFocus={(event) => {
            const target = groupReturnFocus.current?.isConnected
              ? groupReturnFocus.current
              : groupCreateTrigger.current;
            if (target) {
              event.preventDefault();
              target.focus();
            }
          }}
        >
          <header className="shrink-0 space-y-1 border-b px-5 py-4 pr-14">
            <DialogTitle>{editing ? 'Edit group' : 'Create group'}</DialogTitle>
            <DialogDescription>
              Group active prompts without changing their saved history.
            </DialogDescription>
          </header>
          <form
            className="flex min-h-0 flex-col overflow-hidden"
            onSubmit={(event) => {
              event.preventDefault();
              void mutate(async () => {
                await api('/geo/prompt-sets', {
                  ...(editing ? { id: editing.id } : {}),
                  name,
                  promptIds,
                });
                await groups.reload();
                setGroupOpen(false);
              });
            }}
          >
            <div className="min-h-0 space-y-4 overflow-y-auto p-5">
              <label className="block space-y-2 text-sm">
                Group name
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
                <legend className="mb-3 text-sm font-medium">Active prompts</legend>
                {active.map((prompt) => (
                  <label className="flex items-start gap-3 text-sm" key={prompt.id}>
                    <input
                      className="mt-1 size-4 shrink-0 accent-primary"
                      type="checkbox"
                      checked={promptIds.includes(prompt.id)}
                      onChange={(event) => {
                        setPromptIds(
                          event.target.checked
                            ? [...promptIds, prompt.id]
                            : promptIds.filter((id) => id !== prompt.id),
                        );
                      }}
                    />
                    <span className="break-words">{prompt.text}</span>
                  </label>
                ))}
              </fieldset>
              {retired.map((id) => (
                <div key={id} className="space-y-2 rounded-lg border p-3 text-sm">
                  <p>Inactive member: {prompts.find((prompt) => prompt.id === id)?.text ?? id}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setPromptIds(promptIds.filter((value) => value !== id));
                    }}
                  >
                    Remove inactive member
                  </Button>
                </div>
              ))}
              {retired.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Remove inactive members before saving. Their saved answers stay available.
                </p>
              )}
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error.message}
                </p>
              )}
            </div>
            <footer className="flex shrink-0 justify-end border-t px-5 py-4">
              <Button
                disabled={
                  busy ||
                  !promptIds.length ||
                  retired.length > 0 ||
                  promptIds.length > (promptLimit ?? 30)
                }
              >
                Save group
              </Button>
            </footer>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
  const content = (
    <div className="space-y-2">
      {notice}
      {atLimit && !overLimit && (
        <p id="prompt-limit-note" className="text-xs text-muted-foreground">
          All {promptLimit} active prompt slots are in use. Pause a prompt to add another.
        </p>
      )}
      {settings.error && (
        <p role="alert" className="text-sm text-destructive">
          Monitoring configuration unavailable: {settings.error.message}
        </p>
      )}
      {settings.loading && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading monitoring configuration…
        </p>
      )}
      {error && !promptOpen && !groupOpen && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}
      {groups.error && (
        <p role="alert" className="text-sm text-destructive">
          Groups unavailable: {groups.error.message}{' '}
          <Button size="sm" variant="ghost" onClick={() => void groups.reload()}>
            Retry groups
          </Button>
        </p>
      )}
      <div
        className="monitoring-toolbar flex flex-wrap items-center gap-2 rounded-t-xl border border-b-0 bg-card px-3 py-2"
        aria-label="Prompt filters"
      >
        <label className="relative min-w-36 flex-1 basis-48">
          <Search
            className="absolute top-3 left-3 size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            className="h-10 pl-9"
            aria-label="Search prompts"
            placeholder="Search prompts…"
            value={search}
            onChange={(event) => {
              updateFilters({ search: event.target.value }, true);
            }}
          />
        </label>
        <ChoiceButtons
          label="Prompt status"
          value={filter}
          onChange={(value) => {
            updateFilters({ status: value });
          }}
          options={['Active', 'Paused', 'Archived', 'All'].map((value) => ({
            value,
            label: value,
          }))}
        />
        {showGroups && (
          <WorkspaceModal
            title="Prompt filters"
            trigger={
              <Button variant="outline" size="sm" disabled={!groups.data || Boolean(groups.error)}>
                <SlidersHorizontal className="size-4" aria-hidden="true" />
                Filters
              </Button>
            }
            open={filtersOpen}
            onOpenChange={(open) => {
              if (open) setDraftFilters({ group: groupFilter, groupBy });
              setFiltersOpen(open);
            }}
            footer={
              <>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDraftFilters({ group: 'all', groupBy: 'none' });
                  }}
                >
                  Reset
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setFiltersOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    updateFilters(draftFilters);
                    setFiltersOpen(false);
                  }}
                >
                  Apply filters
                </Button>
              </>
            }
          >
            <ChoiceList
              label="Prompt group"
              value={draftFilters.group}
              onChange={(group) => {
                setDraftFilters({ ...draftFilters, group });
              }}
              searchable
              options={[
                { value: 'all', label: 'All groups' },
                { value: 'ungrouped', label: 'Ungrouped' },
                ...(groups.data ?? []).map((group) => ({ value: group.id, label: group.name })),
              ]}
            />
            <ChoiceButtons
              label="Group by"
              value={draftFilters.groupBy}
              onChange={(groupBy) => {
                setDraftFilters({ ...draftFilters, groupBy });
              }}
              options={[
                { value: 'none', label: 'None' },
                { value: 'group', label: 'Prompt group' },
              ]}
            />
          </WorkspaceModal>
        )}
        {settings.data?.configured && (
          <WorkspaceModal
            title="Monitoring scope"
            description="Search and table filters do not change which prompts a check runs. Choosing a scope does not start monitoring."
            trigger={
              <Button
                variant="outline"
                size="sm"
                disabled={groups.loading || Boolean(groups.error)}
                aria-label="Choose monitoring scope"
              >
                Run: {selectedSet?.name ?? 'All active'} ·{' '}
                {
                  (selectedSet
                    ? active.filter((prompt) => selectedSet.promptIds.includes(prompt.id))
                    : active
                  ).length
                }{' '}
                prompts
              </Button>
            }
            open={scopeOpen}
            onOpenChange={(open) => {
              if (open) setDraftScope(selectedSet?.id ?? 'all');
              setScopeOpen(open);
            }}
            footer={
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setScopeOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    setMonitorSet(draftScope);
                    setScopeOpen(false);
                  }}
                >
                  Use this scope
                </Button>
              </>
            }
          >
            <ChoiceList
              label="Prompts to monitor"
              value={draftScope}
              onChange={setDraftScope}
              options={[
                { value: 'all', label: `All active · ${String(active.length)} prompts` },
                ...(groups.data ?? []).map((group) => ({
                  value: group.id,
                  label: `${group.name} · ${String(active.filter((prompt) => group.promptIds.includes(prompt.id)).length)} active prompts`,
                })),
              ]}
            />
            <p className="text-sm text-muted-foreground">
              {settings.data.engines.length} selected engines ·{' '}
              {settings.data.engines.map((engine) => geoSurfaces[engine].label).join(' · ')}
            </p>
          </WorkspaceModal>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refresh saved captures"
              onClick={() => void refreshCaptures()}
              disabled={observations.loading}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh saved captures</TooltipContent>
        </Tooltip>
      </div>
      <ActiveFilters
        items={[
          ...(groupFilter !== 'all'
            ? [
                {
                  key: 'group',
                  label: `Group: ${groupFilter === 'ungrouped' ? 'Ungrouped' : (groups.data?.find((group) => group.id === groupFilter)?.name ?? 'Unavailable')}`,
                  onRemove: () => {
                    updateFilters({ group: 'all' });
                  },
                },
              ]
            : []),
          ...(groupBy !== 'none'
            ? [
                {
                  key: 'groupBy',
                  label: 'Grouped by prompt group',
                  onRemove: () => {
                    updateFilters({ groupBy: 'none' });
                  },
                },
              ]
            : []),
        ]}
      />
      {observations.loading && (
        <p role="status" className="text-xs text-muted-foreground">
          Loading saved captures…
        </p>
      )}
      {(observations.error ?? captureError) && (
        <p role="alert" className="text-sm text-destructive">
          Saved captures unavailable. {observations.error?.message ?? captureError?.message}
        </p>
      )}
      {overLimit && (
        <p role="alert" className="mb-3 rounded-lg border p-3 text-sm">
          Your plan allows {promptLimit} active prompts. Pause prompts to choose which remain active
          before starting another check. Your prompts and saved answers are preserved.
        </p>
      )}
      <div className="monitoring-table overflow-hidden rounded-b-xl border bg-card">
        <table className="prompt-table w-full table-fixed text-left text-sm">
          <caption className="sr-only">Prompts, groups, status and loaded engine captures</caption>
          <thead className="bg-muted/40">
            <tr>
              <th scope="col" className={`${showGroups ? 'w-[30%]' : 'w-[45%]'} px-3 py-2`}>
                Prompt
              </th>
              {showGroups && (
                <th scope="col" className="w-[15%] px-3 py-2">
                  Groups
                </th>
              )}
              <th scope="col" className="w-[10%] p-3">
                Status
              </th>
              <th scope="col" className="w-[25%] p-3">
                Engines
              </th>
              <th scope="col" className="w-[20%] p-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          {sections.map((section) => (
            <tbody key={section.id}>
              {section.name && (
                <tr className="border-t bg-muted/20">
                  <th colSpan={showGroups ? 5 : 4} scope="rowgroup" className="px-3 py-2">
                    <button
                      type="button"
                      className="flex min-h-8 items-center gap-2 text-sm font-medium"
                      aria-expanded={!collapsed.includes(section.id)}
                      onClick={() => {
                        setCollapsed(
                          collapsed.includes(section.id)
                            ? collapsed.filter((id) => id !== section.id)
                            : [...collapsed, section.id],
                        );
                      }}
                    >
                      <ChevronDown
                        className={`size-4 ${collapsed.includes(section.id) ? '-rotate-90' : ''}`}
                        aria-hidden="true"
                      />
                      <FolderOpen className="size-4 text-muted-foreground" aria-hidden="true" />
                      {section.name}
                      <Badge variant="secondary">{section.rows.length}</Badge>
                    </button>
                  </th>
                </tr>
              )}
              {!collapsed.includes(section.id) &&
                section.rows.map((prompt) => (
                  <tr className="border-t align-top hover:bg-muted/10" key={prompt.id}>
                    <th scope="row" className="break-words px-3 py-2 font-medium">
                      <Link
                        className="leading-relaxed hover:text-primary"
                        to={`/app/observations?promptId=${encodeURIComponent(prompt.id)}&days=30`}
                      >
                        {prompt.text}
                      </Link>
                    </th>
                    {showGroups && (
                      <td className="px-3 py-2" data-label="Groups">
                        <div className="flex flex-wrap gap-1">
                          {groups.loading ? (
                            'Loading…'
                          ) : groups.error ? (
                            'Unavailable'
                          ) : groups.data?.some((group) => group.promptIds.includes(prompt.id)) ? (
                            groups.data
                              .filter((group) => group.promptIds.includes(prompt.id))
                              .map((group) => (
                                <Badge
                                  className="max-w-full whitespace-normal break-words"
                                  variant="secondary"
                                  key={group.id}
                                >
                                  {group.name}
                                </Badge>
                              ))
                          ) : (
                            <span className="text-xs text-muted-foreground">Ungrouped</span>
                          )}
                        </div>
                      </td>
                    )}
                    <td className="px-3 py-2" data-label="Status">
                      <Badge variant={status(prompt) === 'Active' ? 'success' : 'secondary'}>
                        {status(prompt)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2" data-label="Engines">
                      <div className="flex flex-wrap gap-1">
                        {settings.data?.engines.map((engine) => (
                          <EngineLink
                            key={engine}
                            engine={engine}
                            promptId={prompt.id}
                            observation={
                              captures
                                .filter(
                                  (capture) =>
                                    capture.context.promptId === prompt.id &&
                                    capture.engine === engine,
                                )
                                .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0]
                            }
                            loading={observations.loading}
                            error={Boolean(observations.error ?? captureError)}
                          />
                        ))}
                        {settings.loading ? (
                          'Loading…'
                        ) : settings.error ? (
                          'Unavailable'
                        ) : !settings.data?.engines.length ? (
                          <span className="text-xs text-muted-foreground">No engines selected</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <Button asChild size="sm" variant="ghost">
                          <Link
                            to={`/app/observations?promptId=${encodeURIComponent(prompt.id)}&days=30`}
                          >
                            View answers
                          </Link>
                        </Button>
                        {!locked && (
                          <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Manage prompt: ${prompt.text}`}
                              >
                                <MoreHorizontal aria-hidden="true" className="size-4" />
                              </Button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                              <DropdownMenu.Content
                                align="end"
                                className="workspace-theme z-50 min-w-40 rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-sm"
                              >
                                {[
                                  prompt.enabled && !prompt.archivedAt ? 'Pause' : 'Resume',
                                  ...(!prompt.archivedAt ? ['Archive'] : []),
                                ].map((label) => (
                                  <DropdownMenu.Item
                                    key={label}
                                    disabled={
                                      busy || (label === 'Resume' && (!data.canScan || atLimit))
                                    }
                                    className="cursor-default rounded px-3 py-2 outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted"
                                    onSelect={() =>
                                      void mutate(() =>
                                        api(
                                          `/questions/${prompt.id}`,
                                          {
                                            action: label.toLowerCase(),
                                            expectedUpdatedAt: prompt.updatedAt,
                                          },
                                          'PATCH',
                                        ),
                                      )
                                    }
                                  >
                                    {label}
                                  </DropdownMenu.Item>
                                ))}
                              </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                          </DropdownMenu.Root>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          ))}
        </table>
        {!visible.length && (
          <div className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <ListChecks className="size-5 shrink-0" aria-hidden="true" />
            No prompts in this view. Try another filter or add a prompt.
          </div>
        )}
      </div>
      <div
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 py-1 text-xs text-muted-foreground"
        aria-label="Prompt summary and capture legend"
      >
        <span>
          {visible.length} shown · {active.length} active ·{' '}
          {groups.loading
            ? 'Groups loading…'
            : groups.error
              ? 'Groups unavailable'
              : `${String(groups.data?.length ?? 0)} groups`}{' '}
          ·{' '}
          {settings.loading
            ? 'Engines loading…'
            : settings.error
              ? 'Engines unavailable'
              : `${String(settings.data?.engines.length ?? 0)} engines`}
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-foreground" aria-hidden="true" />
            Capture loaded
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full border border-muted-foreground opacity-50"
              aria-hidden="true"
            />
            Not loaded
          </span>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="icon" variant="ghost" aria-label="About these results">
                <Info className="size-4" aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent aria-label="About these results" className="workspace-theme text-sm">
              Icons reflect loaded captures from the last 30 days. A capture does not establish a
              brand mention, recommendation or ranking. API results can differ from consumer AI
              apps. Open Answers to inspect captures by prompt and engine.
            </PopoverContent>
          </Popover>
        </div>
      </div>
      {nextCursor && (
        <Button
          variant="outline"
          disabled={loadingMore}
          onClick={() => {
            const generation = captureGeneration.current;
            setLoadingMore(true);
            setCaptureError(null);
            void api<GeoObservationPage>(
              `/geo/observations?days=30&cursor=${encodeURIComponent(nextCursor)}`,
            )
              .then((page) => {
                if (generation === captureGeneration.current)
                  setOlder((previous) => ({
                    observations: [...(previous?.observations ?? []), ...page.observations],
                    nextCursor: page.nextCursor,
                  }));
              })
              .catch((reason: unknown) => {
                if (generation === captureGeneration.current)
                  setCaptureError(
                    reason instanceof Error ? reason : new Error('Could not load saved captures.'),
                  );
              })
              .finally(() => {
                if (generation === captureGeneration.current) setLoadingMore(false);
              });
          }}
        >
          {loadingMore ? 'Loading…' : 'Load more saved captures'}
        </Button>
      )}
      {groups.data && groups.data.length > 0 && (
        <WorkspaceModal
          title="Manage prompt groups"
          trigger={<Button variant="outline">Manage prompt groups · {groups.data.length}</Button>}
          open={manageOpen}
          onOpenChange={setManageOpen}
        >
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error.message}
            </p>
          )}
          <div className="divide-y">
            {groups.data.map((group) => (
              <div
                key={group.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium">{group.name}</p>
                  <p className="text-xs text-muted-foreground">{group.promptIds.length} prompts</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!data.canScan || busy}
                    onClick={() => {
                      editGroup(group);
                    }}
                  >
                    Edit group
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!data.canScan || busy}
                    onClick={() =>
                      void mutate(async () => {
                        await api(
                          `/geo/prompt-sets/${encodeURIComponent(group.id)}`,
                          undefined,
                          'DELETE',
                        );
                        if (monitorSet === group.id) setMonitorSet('all');
                        if (groupFilter === group.id) updateFilters({ group: 'all' });
                        await groups.reload();
                      })
                    }
                  >
                    Delete group
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </WorkspaceModal>
      )}
      <WorkspaceModal
        title="Previous Perplexity answers"
        trigger={<Button variant="ghost">Previous Perplexity answers</Button>}
        wide
      >
        <div className="space-y-4">{legacy}</div>
      </WorkspaceModal>
    </div>
  );
  return (
    <section className="space-y-3">
      {settings.data?.configured && data.plan?.id !== 'legacy_perplexity' ? (
        <GeoMonitor
          compact
          heading={<WorkspaceHeading title="Prompts">{actions}</WorkspaceHeading>}
          promptIds={monitorSet === 'all' ? undefined : (selectedSet?.promptIds ?? [])}
          onComplete={() => void refreshCaptures()}
        >
          {content}
        </GeoMonitor>
      ) : (
        <>
          <WorkspaceHeading title="Prompts">
            {actions}
            {legacyMonitor}
          </WorkspaceHeading>
          {content}
        </>
      )}
    </section>
  );
}

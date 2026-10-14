import { useState, type ReactNode, type SubmitEvent } from 'react';
import {
  BarChart3,
  ListChecks,
  FileText,
  Stethoscope,
  CheckSquare,
  Globe,
  Users,
  CreditCard,
  Settings,
  Menu,
  LogOut,
  LifeBuoy,
  ChevronRight,
} from 'lucide-react';
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
  useLocation,
} from 'react-router';
import { Button } from '../../components/ui/button';
import { BrandLogo } from '../../components/BrandLogo';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '../../components/ui/dialog';
import { highlight } from '../../lib/highlight';
import { ApiError, api, emitEvent, useInspection, useResource } from './api';
import { fixtureMode, leaveFixture } from './geo-fixture-mode';
import { GeoPromptSets, GeoSettingsPanel } from './GeoWorkspace';
import type { GeoSettings } from '../../../shared/geo';
import type {
  V2HistoryPayload,
  V2Observation,
  V2ObservationPayload,
  V2ProjectPayload,
  V2QuestionsPayload,
  V2QuestionRow,
} from '../../../shared/v2';

export interface WorkspaceContext {
  data: V2ProjectPayload;
  reload: () => Promise<void>;
}
const time = (date: string | null | undefined) =>
  date
    ? new Date(date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : 'Not scheduled';
const box = 'rounded-xl border bg-card p-5 shadow-sm';
function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">{children}</p>
  );
}
function Failure({ error }: { error: Error | null }) {
  return error ? (
    <p
      role="alert"
      className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
    >
      {error.message}
    </p>
  ) : null;
}
function useAction(reload?: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await work();
      await reload?.();
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Request failed.'));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}
export function V2Shell() {
  const fixture = fixtureMode();
  const resource = useResource<V2ProjectPayload>('/project', true);
  const navigate = useNavigate();
  const action = useAction();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const navigation = [
    { label: 'Overview', path: '/app/overview', Icon: BarChart3, group: 'Workspace' },
    { label: 'Prompt Sets', path: '/app/questions', Icon: ListChecks },
    { label: 'Observations', path: '/app/observations', Icon: FileText },
    { label: 'Diagnoses', path: '/app/diagnoses', Icon: Stethoscope, group: 'Improve' },
    { label: 'Action Playbook', path: '/app/playbook', Icon: CheckSquare },
    { label: 'Sources', path: '/app/sources', Icon: Globe },
    { label: 'Competitors', path: '/app/competitors', Icon: Users },
    { label: 'Billing & usage', path: '/app/billing', Icon: CreditCard, group: 'Account' },
    { label: 'Settings', path: '/app/settings', Icon: Settings },
  ];
  const activePage =
    navigation.find((item) => pathname.startsWith(item.path))?.label ?? 'Project setup';
  const sidebar = (
    <>
      <Link
        to="/"
        className="flex h-16 shrink-0 items-center border-b px-5"
        aria-label="CiteScout home"
      >
        <BrandLogo />
      </Link>
      <Link
        to="/app/settings"
        onClick={() => {
          setMobileOpen(false);
        }}
        className="m-3 flex items-center gap-3 rounded-lg border bg-background p-3"
      >
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-semibold text-primary"
          aria-hidden="true"
        >
          {resource.data?.project?.brandName.slice(0, 2).toUpperCase() ?? 'CS'}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">
            {resource.data?.project?.brandName ?? 'Your workspace'}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {resource.data?.project?.canonicalDomain ?? 'Complete project setup'}
          </span>
        </span>
      </Link>
      <nav aria-label="Application" className="min-h-0 flex-1 overflow-y-auto px-3 pb-5">
        {navigation.map(({ label, path, Icon, group }) => (
          <div key={path}>
            {group && (
              <p className="px-3 pb-2 pt-5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group}
              </p>
            )}
            <NavLink
              to={path}
              onClick={() => {
                setMobileOpen(false);
              }}
              className={({ isActive }) =>
                `mb-1 flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`
              }
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {label}
            </NavLink>
          </div>
        ))}
      </nav>
      <div className="border-t p-3">
        <p className="px-3 py-2 text-xs text-muted-foreground">
          {resource.data?.canScan ? 'Paid monitoring access' : 'Saved evidence stays available'}
        </p>
        <Button
          variant="ghost"
          className="w-full justify-start"
          size="sm"
          disabled={action.busy}
          onClick={() =>
            void action.run(async () => {
              if (fixture.requested) {
                leaveFixture();
                return;
              }
              const response = await fetch('/api/auth/sign-out', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
              });
              if (!response.ok) throw new Error('Could not sign out.');
              sessionStorage.removeItem('citescout-run');
              await navigate('/');
            })
          }
        >
          <LogOut className="size-4" aria-hidden="true" />
          Sign out
        </Button>
      </div>
    </>
  );
  if (resource.error instanceof ApiError && resource.error.status === 401)
    return <Navigate to="/login" replace />;
  return (
    <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
      <div className="flex min-h-svh bg-background">
        <aside
          className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col self-start border-r bg-muted/25 lg:flex"
          aria-label="Workspace sidebar"
        >
          {sidebar}
        </aside>
        <DialogContent className="inset-y-0 left-0 top-0 flex h-svh w-72 max-w-[calc(100%-3rem)] translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-background p-0 sm:max-w-72">
          <DialogTitle className="sr-only">Workspace navigation</DialogTitle>
          <DialogDescription className="sr-only">
            Navigate your CiteScout workspace.
          </DialogDescription>
          {sidebar}
        </DialogContent>
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background px-4 sm:px-8">
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Open navigation"
              >
                <Menu className="size-4" aria-hidden="true" />
              </Button>
            </DialogTrigger>
            <span className="hidden text-sm text-muted-foreground sm:inline">Workspace</span>
            <ChevronRight
              className="hidden size-3 text-muted-foreground sm:inline"
              aria-hidden="true"
            />
            <span className="text-sm font-medium">{activePage}</span>
            <a
              href={`mailto:${resource.data?.supportEmail ?? 'support@cite-scout.com'}`}
              className="ml-auto flex min-h-9 items-center gap-2 text-xs text-muted-foreground"
              aria-label="Contact support"
            >
              <LifeBuoy className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Help & support</span>
            </a>
          </header>
          <main
            id="main"
            tabIndex={-1}
            className="mx-auto max-w-[1440px] space-y-5 px-4 py-7 outline-none sm:px-8"
          >
            {fixture.requested && (
              <div
                role="status"
                className="sticky top-16 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-background p-3 text-sm"
              >
                <span className="font-medium">
                  Fixture workspace — synthetic data · no provider calls
                </span>
                <Button variant="outline" size="sm" onClick={leaveFixture}>
                  Exit fixture
                </Button>
                {!fixture.enabled && (
                  <span className="w-full text-xs">
                    This local fixture is unavailable in this environment. Live requests remain
                    blocked.
                  </span>
                )}
              </div>
            )}
            <Failure error={action.error ?? resource.error} />
            {resource.loading && !resource.data ? (
              <p role="status">Loading your questions…</p>
            ) : resource.data ? (
              <Outlet
                context={
                  { data: resource.data, reload: resource.reload } satisfies WorkspaceContext
                }
              />
            ) : (
              <Button onClick={() => void resource.reload()}>Retry</Button>
            )}
          </main>
        </div>
      </div>
    </Dialog>
  );
}
function TrialStatus({ data }: { data: V2ProjectPayload }) {
  return (
    <Notice>
      {data.internalTestAccess
        ? 'Owner staging validation · daily monitoring off by default'
        : data.canScan
          ? 'Perplexity monitoring access · legacy plan & history'
          : data.trial
            ? `Pilot · ${data.trial.state}`
            : 'Founder-assisted pilot'}
      {data.trial?.followupDueAt && !data.canScan && (
        <> · Follow-up: {time(data.trial.followupDueAt)}</>
      )}
      {data.trial?.expiresAt && !data.canScan && <> · Expires: {time(data.trial.expiresAt)}</>}
      {!data.scansEnabled && (
        <span className="block mt-1">
          Provider checks are currently paused. Your saved evidence remains available.
        </span>
      )}
      <span className="block mt-1">
        API results may differ from the Perplexity app. A name match is not a recommendation or
        ranking.
      </span>
    </Notice>
  );
}
interface IdentityDraft {
  brandName: string;
  canonicalDomain: string;
  competitors: { id?: string; name: string; canonicalDomain: string | null }[];
}
function IdentityFields({
  value,
  set,
  disabled,
}: {
  value: IdentityDraft;
  set: (value: IdentityDraft) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          Company name
          <Input
            required
            maxLength={80}
            value={value.brandName}
            onChange={(e) => {
              set({ ...value, brandName: e.target.value });
            }}
          />
        </label>
        <label className="space-y-1 text-sm">
          Company domain
          <Input
            required
            placeholder="example.com"
            value={value.canonicalDomain}
            onChange={(e) => {
              set({ ...value, canonicalDomain: e.target.value });
            }}
          />
        </label>
      </div>
      <p className="text-sm font-medium">One to three meaningful competitors</p>
      {value.competitors.map((competitor, index) => (
        <div key={competitor.id ?? index} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            aria-label={`Competitor ${String(index + 1)} name`}
            required
            placeholder="Company name"
            maxLength={80}
            value={competitor.name}
            onChange={(e) => {
              set({
                ...value,
                competitors: value.competitors.map((c, i) =>
                  i === index ? { ...c, name: e.target.value } : c,
                ),
              });
            }}
          />
          <Input
            aria-label={`Competitor ${String(index + 1)} domain`}
            placeholder="Domain (optional)"
            value={competitor.canonicalDomain ?? ''}
            onChange={(e) => {
              set({
                ...value,
                competitors: value.competitors.map((c, i) =>
                  i === index ? { ...c, canonicalDomain: e.target.value } : c,
                ),
              });
            }}
          />
          <Button
            type="button"
            variant="ghost"
            disabled={value.competitors.length === 1}
            onClick={() => {
              set({ ...value, competitors: value.competitors.filter((_, i) => i !== index) });
            }}
          >
            Remove
          </Button>
        </div>
      ))}
      {value.competitors.length < 3 && (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            set({
              ...value,
              competitors: [...value.competitors, { name: '', canonicalDomain: null }],
            });
          }}
        >
          Add competitor
        </Button>
      )}
    </fieldset>
  );
}
export function V2Onboarding() {
  const { data, reload } = useOutletContext<WorkspaceContext>();
  const navigate = useNavigate();
  const action = useAction();
  const [identity, setIdentity] = useState<IdentityDraft>({
    brandName: '',
    canonicalDomain: '',
    competitors: [{ name: '', canonicalDomain: null }],
  });
  const [questions, setQuestions] = useState(['', '', '']);
  const [review, setReview] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  if (data.project)
    return <Navigate to={data.internalTestAccess ? '/app/overview' : '/app/questions'} replace />;
  if (!data.enrolled && !data.canScan && !data.internalTestAccess)
    return (
      <section className="mx-auto max-w-xl space-y-5 py-12">
        <h1 className="text-3xl font-semibold">Run your first buyer-question baseline</h1>
        <Notice>
          The pilot is currently founder-assisted. Bring three real questions you have already
          checked in Perplexity.
        </Notice>
        <Button asChild>
          <a href={`mailto:${data.supportEmail}`}>Contact the founder</a>
        </Button>
      </section>
    );
  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!review) {
      setReview(true);
      return;
    }
    await action.run(async () => {
      await api('/project', { ...identity, questions, idempotencyKey: key });
      if (data.internalTestAccess) {
        await reload();
        await navigate('/app/overview');
        return;
      }
      const result = await api<{ runId: string }>('/scans', {
        mode: data.canScan ? 'today' : 'baseline',
      });
      sessionStorage.setItem('citescout-run', result.runId);
      await reload();
      await navigate(`/app/questions?run=${result.runId}`);
    });
  }
  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          {data.internalTestAccess ? 'Owner staging validation' : 'Your first baseline'}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">What do your buyers ask?</h1>
      </div>
      <TrialStatus data={data} />
      <form onSubmit={(e) => void submit(e)} className={`${box} space-y-5`}>
        <IdentityFields value={identity} set={setIdentity} disabled={review} />
        {questions.map((q, index) => (
          <label key={index} className="block space-y-2 text-sm">
            Buyer question {index + 1}
            <Textarea
              required
              minLength={10}
              maxLength={500}
              disabled={review}
              value={q}
              placeholder="Which customer onboarding tools work for a small B2B SaaS team?"
              onChange={(e) => {
                setQuestions(questions.map((text, i) => (i === index ? e.target.value : text)));
              }}
            />
            {identity.brandName.length > 1 &&
              q.toLowerCase().includes(identity.brandName.toLowerCase()) && (
                <span className="text-muted-foreground">
                  Naming your brand may encourage a mention. Keep it if that reflects a real buyer
                  question.
                </span>
              )}
          </label>
        ))}
        <p className="text-sm text-muted-foreground">
          Use questions a buyer would ask when comparing options.
          {data.internalTestAccess
            ? ' Saving creates your project without calling a provider. Choose engines and use Monitor Prompts afterward.'
            : ' All three questions will be checked.'}
        </p>
        {review && (
          <Notice>
            {data.internalTestAccess
              ? 'Save these three questions for GEO validation. Daily monitoring stays off. Review provider setup and quota before starting a manual check.'
              : 'We will save a baseline, then re-check successful questions 72 hours after baseline processing finishes. Your trial ends after 14 days. Questions stay fixed during the trial. No card required.'}
          </Notice>
        )}
        <Failure error={action.error} />
        <div className="flex gap-3">
          {review && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setReview(false);
              }}
            >
              Edit
            </Button>
          )}
          <Button disabled={action.busy}>
            {action.busy
              ? 'Starting…'
              : review
                ? data.internalTestAccess
                  ? 'Create staging project'
                  : 'Run my baseline'
                : data.internalTestAccess
                  ? 'Review project'
                  : 'Review baseline'}
          </Button>
        </div>
      </form>
    </section>
  );
}
interface RunView {
  runId: string;
  status: string;
  terminal: boolean;
  nextRetryAt: string | null;
  counts: {
    selected: number;
    successful: number;
    failed: number;
    pending: number;
    running: number;
  };
  items: {
    questionId: string;
    text: string;
    status: string;
    reason: string | null;
    failureCode: string | null;
    observationId: string | null;
    dueAt: string | null;
  }[];
}
const runPending = (run: RunView) => !run.terminal;
export function RunProgress({ id }: { id: string }) {
  const { data } = useOutletContext<WorkspaceContext>();
  const run = useResource<RunView>(`/scans/${id}`, runPending);
  if (!run.data) return <Failure error={run.error} />;
  return (
    <section className={`${box} space-y-2`} aria-live="polite">
      <h2 className="font-medium">
        {run.data.counts.successful} of {run.data.counts.selected} answers captured ·{' '}
        {run.data.status}
      </h2>
      <p className="text-sm text-muted-foreground">
        {run.data.nextRetryAt
          ? `Next eligible attempt: ${time(run.data.nextRetryAt)}`
          : run.data.counts.successful
            ? 'Open an answer to inspect the evidence.'
            : 'No usable answer has been captured yet.'}
      </p>
      {run.data.terminal && run.data.counts.successful === 0 && (
        <p className="text-sm">
          This check ended without a usable answer.{' '}
          <a className="underline" href={`mailto:${data.supportEmail}`}>
            Contact the founder for help
          </a>
          .
        </p>
      )}
      {run.data.items
        .filter((i) => i.failureCode ?? i.reason)
        .map((i) => (
          <p key={i.questionId} className="text-sm">
            {i.text} — {i.failureCode ?? i.reason}
          </p>
        ))}
    </section>
  );
}
export function V2Questions() {
  const fixture = fixtureMode();
  const context = useOutletContext<WorkspaceContext>();
  const { data } = context;
  const [params, setParams] = useSearchParams();
  const rows = useResource<V2QuestionsPayload>(data.project ? '/questions' : null, true);
  const geoSettings = useResource<GeoSettings>(data.project ? '/geo/settings' : null);
  const action = useAction(async () => {
    await rows.reload();
    await context.reload();
  });
  const [text, setText] = useState('');
  const [filter, setFilter] = useState('all');
  if (!data.project) return <Navigate to="/app/onboarding" replace />;
  const runId = fixture.requested
    ? null
    : (params.get('run') ?? sessionStorage.getItem('citescout-run'));
  async function start() {
    if (geoSettings.loading || geoSettings.error || geoSettings.data?.configured === true) return;
    await action.run(async () => {
      const result = await api<{ runId: string }>('/scans', {
        mode: data.canScan ? 'today' : 'baseline',
      });
      sessionStorage.setItem('citescout-run', result.runId);
      setParams({ run: result.runId });
    });
  }
  const visible =
    rows.data?.questions.filter((q) =>
      filter === 'archived'
        ? Boolean(q.archivedAt)
        : filter === 'paused'
          ? !q.enabled && !q.archivedAt
          : !q.archivedAt &&
            q.enabled &&
            (filter === 'changed'
              ? q.delta?.changed
              : filter === 'attention'
                ? q.needsAttention
                : true),
    ) ?? [];
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{data.project.brandName}</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {geoSettings.data?.configured ? 'Prompt Sets' : 'Buyer questions'}
          </h1>
        </div>
        {geoSettings.data?.configured !== true &&
          !geoSettings.loading &&
          (data.canScan || data.trial?.state === 'eligible') && (
            <Button
              disabled={action.busy || Boolean(geoSettings.error)}
              onClick={() => void start()}
            >
              {data.canScan ? 'Check today' : 'Run my baseline'}
            </Button>
          )}
      </div>
      <TrialStatus data={data} />
      <GeoPromptSets />
      {geoSettings.data?.configured && (
        <Notice>
          Legacy Perplexity saved answers and question management. These literal-match summaries are
          separate from classified GEO cohort metrics above. Existing frozen trials retain their
          scheduled follow-up.
        </Notice>
      )}
      <Failure error={action.error ?? rows.error ?? geoSettings.error} />
      {runId && <RunProgress id={runId} />}
      {rows.data && (
        <div className="space-y-2">
          <p className="text-xl font-medium">
            Brand match in {rows.data.summary.brandMatched} of {rows.data.summary.available}{' '}
            available answers.
          </p>
          <p className="text-sm text-muted-foreground">
            {rows.data.summary.tracked} questions tracked · {rows.data.summary.changed} changed of{' '}
            {rows.data.summary.comparable} comparable questions ·{' '}
            {rows.data.summary.sourcesUnavailable} with incomplete source comparisons.
          </p>
          {rows.data.summary.from && (
            <p className="text-xs text-muted-foreground">
              Captured {time(rows.data.summary.from)} — {time(rows.data.summary.to)}
            </p>
          )}
        </div>
      )}
      {!data.canScan && ['completed', 'expired', 'cancelled'].includes(data.trial?.state ?? '') && (
        <Notice>
          Monitoring stopped. Your saved evidence remains available.{' '}
          <Link className="underline" to="/app/settings">
            Continue daily monitoring — $19/month
          </Link>
        </Notice>
      )}
      <div role="group" aria-label="Question filter" className="flex flex-wrap gap-2">
        {[
          ['all', 'All'],
          ['changed', 'Changed'],
          ['attention', 'Needs attention'],
          ['paused', 'Paused'],
          ['archived', 'Archived'],
        ].map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={filter === value ? 'default' : 'outline'}
            onClick={() => {
              if (value) setFilter(value);
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      {rows.loading ? (
        <p role="status">Loading evidence…</p>
      ) : visible.length === 0 ? (
        <Notice>No questions in this view.</Notice>
      ) : (
        <div className="grid gap-4">
          {visible.map((q) => (
            <QuestionCard
              key={q.id}
              q={q}
              canEdit={!['baseline', 'waiting', 'followup'].includes(data.trial?.state ?? '')}
              canResume={data.canScan}
              busy={action.busy}
              mutate={(work) => action.run(work)}
            />
          ))}
        </div>
      )}
      {data.canScan && (
        <form
          className={`${box} space-y-3`}
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              await api('/questions', { text });
              setText('');
            });
          }}
        >
          <label htmlFor="new-question" className="font-medium">
            Add a buyer question
          </label>
          <Textarea
            id="new-question"
            required
            minLength={10}
            maxLength={500}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
            }}
          />
          <p className="text-xs text-muted-foreground">
            Up to ten active questions. New questions join the next UTC day's checks.
          </p>
          <Button disabled={action.busy}>Add question</Button>
        </form>
      )}
    </section>
  );
}
function QuestionCard({
  q,
  canEdit,
  canResume,
  busy,
  mutate,
}: {
  q: V2QuestionRow;
  canEdit: boolean;
  canResume: boolean;
  busy: boolean;
  mutate: (work: () => Promise<unknown>) => Promise<void>;
}) {
  return (
    <article className={`${box} space-y-3`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="max-w-3xl font-medium leading-relaxed">{q.text}</h2>
        <span className="text-xs text-muted-foreground">
          {q.archivedAt ? 'Archived' : q.enabled ? 'Active' : 'Paused'}
        </span>
      </div>
      <p className="text-sm">
        {q.contextChanged
          ? 'New baseline needed: configuration changed'
          : q.latest
            ? `${q.latest.brandMatched ? 'Brand match found' : 'No brand match found'}${q.latest.competitors.length ? ` · ${q.latest.competitors.join(', ')}` : ''}`
            : 'Awaiting a successful answer'}
      </p>
      <p className="text-sm text-muted-foreground">
        {q.delta?.summary ?? 'Baseline investigation'}
        {q.stale ? ' · Last answer is stale' : ''}
      </p>
      <p className="text-xs text-muted-foreground">
        {q.latest
          ? `Last successful check: ${time(q.latest.capturedAt)}`
          : 'No successful check yet'}
        {q.latestAttempt?.status === 'failed'
          ? ` · Latest attempt failed: ${q.latestAttempt.failureCode ?? 'provider error'}`
          : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to={`/app/questions/${q.id}${q.latest ? `?observation=${q.latest.id}` : ''}`}>
            {q.previousId ? 'Compare checks' : 'Inspect answer'}
          </Link>
        </Button>
        {canEdit && (
          <>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || ((!q.enabled || Boolean(q.archivedAt)) && !canResume)}
              onClick={() =>
                void mutate(() =>
                  api(
                    `/questions/${q.id}`,
                    {
                      action: q.enabled && !q.archivedAt ? 'pause' : 'resume',
                      expectedUpdatedAt: q.updatedAt,
                    },
                    'PATCH',
                  ),
                )
              }
            >
              {q.enabled && !q.archivedAt ? 'Pause' : 'Resume'}
            </Button>
            {!q.archivedAt && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void mutate(() =>
                    api(
                      `/questions/${q.id}`,
                      { action: 'archive', expectedUpdatedAt: q.updatedAt },
                      'PATCH',
                    ),
                  )
                }
              >
                Archive
              </Button>
            )}
          </>
        )}
      </div>
    </article>
  );
}
export function V2QuestionDetail() {
  const { questionId } = useParams();
  const { data: project } = useOutletContext<WorkspaceContext>();
  const [params, setParams] = useSearchParams();
  const [cursor, setCursor] = useState<string | null>(null);
  const history = useResource<V2HistoryPayload>(
    questionId
      ? `/questions/${questionId}/history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`
      : null,
    true,
  );
  const selected =
    params.get('observation') ?? history.data?.entries.find((e) => e.kind === 'observation')?.id;
  const compareTo = params.get('compareTo');
  const evidence = useResource<V2ObservationPayload>(
    selected
      ? `/observations/${selected}${compareTo ? `?compareTo=${encodeURIComponent(compareTo)}` : ''}`
      : null,
  );
  const action = useAction(history.reload);
  const [replacement, setReplacement] = useState('');
  const navigate = useNavigate();
  const matchesQuestion = evidence.data?.observation.questionId === questionId;
  useInspection(
    matchesQuestion && evidence.data?.observation.capture
      ? evidence.data.observation.id
      : undefined,
    matchesQuestion && evidence.data?.delta?.eligible ? evidence.data.comparison?.id : undefined,
  );
  function select(id: string, comparison?: string | null) {
    setParams({ observation: id, ...(comparison ? { compareTo: comparison } : {}) });
  }
  const canEditDraft = Boolean(
    history.data &&
    !cursor &&
    history.data.entries.length === 0 &&
    !['baseline', 'waiting', 'followup'].includes(project.trial?.state ?? ''),
  );
  return (
    <section className="space-y-6">
      <Link to="/app/questions" className="text-sm underline">
        ← Buyer questions
      </Link>
      <h1 className="text-2xl font-semibold leading-snug">
        {history.data?.question.text ?? 'Question history'}
      </h1>
      <Failure error={history.error ?? evidence.error ?? action.error} />
      <Notice>
        One observed API answer per check. Name/domain matches and returned sources are evidence to
        inspect; changes do not establish cause.
      </Notice>
      {history.data?.entries[0]?.kind === 'attempt' && (
        <Notice>
          Latest attempt: {history.data.entries[0].status} ·{' '}
          {history.data.entries[0].failureCode ?? 'Check in progress'}. Earlier successful evidence
          remains below.
        </Notice>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">
          Observation{' '}
          <select
            className="ml-2 max-w-full rounded-md border bg-background p-2"
            value={selected ?? ''}
            onChange={(e) => {
              select(e.target.value);
            }}
          >
            <option value="" disabled>
              Select an answer
            </option>
            {history.data?.entries
              .filter((e) => e.kind === 'observation')
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {time(e.at)}
                  {e.evidenceVersion?.startsWith('legacy') ? ' · Legacy' : ''}
                </option>
              ))}
          </select>
        </label>
        {matchesQuestion && evidence.data && (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={!evidence.data.previousId}
              onClick={() => {
                select(evidence.data?.observation.id ?? '', evidence.data?.previousId);
              }}
            >
              Previous check
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!evidence.data.baselineId}
              onClick={() => {
                select(evidence.data?.observation.id ?? '', evidence.data?.baselineId);
              }}
            >
              Baseline
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                void action.run(() => {
                  if (typeof navigator.clipboard === 'undefined')
                    throw new Error('Clipboard is unavailable in this browser.');
                  return navigator.clipboard.writeText(
                    `${location.origin}/app/questions/${questionId ?? ''}?observation=${selected ?? ''}${compareTo ? `&compareTo=${compareTo}` : ''}`,
                  );
                })
              }
            >
              Copy evidence link
            </Button>
          </>
        )}
      </div>
      {matchesQuestion && evidence.data ? (
        <>
          <h2 className="text-lg font-medium">
            {evidence.data.delta?.summary ??
              (evidence.data.comparisonReason === 'legacy_provenance'
                ? 'Legacy evidence: historical context is incomplete'
                : 'Baseline · no comparable earlier observation')}
          </h2>
          {evidence.data.delta?.eligible && (
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              {(['returnedSources', 'citedSources'] as const).map((key) => {
                const delta = evidence.data?.delta?.[key];
                if (!delta) return null;
                return (
                  <div key={key} className="rounded-lg border p-3">
                    <h3 className="font-medium">
                      {key === 'returnedSources' ? 'Returned sources' : 'Cited sources'}
                    </h3>
                    {delta.available ? (
                      <div>
                        <p>
                          {delta.added.length} added · {delta.removed.length} removed
                        </p>
                        <ul className="mt-2 space-y-1 break-all text-xs">
                          {delta.added.map((url) => (
                            <li key={`added:${url}`}>Added: {url}</li>
                          ))}
                          {delta.removed.map((url) => (
                            <li key={`removed:${url}`}>Removed: {url}</li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-muted-foreground">
                        Comparison unavailable: {delta.reason?.replaceAll('_', ' ')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {evidence.data.delta?.eligible && (
            <ul className="space-y-1 text-sm">
              {evidence.data.delta.competitors.map((entity) => (
                <li key={entity.id}>
                  {entity.name}: match {entity.change}
                </li>
              ))}
            </ul>
          )}
          {evidence.data.comparison && (
            <p className="text-sm text-muted-foreground">
              {Math.round(
                (Date.parse(evidence.data.observation.capturedAt) -
                  Date.parse(evidence.data.comparison.capturedAt)) /
                  3600000,
              )}{' '}
              hours between captured answers. Intermediate checks may be missing.
            </p>
          )}
          <div className={`grid min-w-0 gap-5 ${evidence.data.comparison ? 'lg:grid-cols-2' : ''}`}>
            {evidence.data.comparison && (
              <Answer observation={evidence.data.comparison} label="Before" />
            )}
            <Answer
              observation={evidence.data.observation}
              label={evidence.data.comparison ? 'After' : 'Captured answer'}
            />
          </div>
        </>
      ) : (
        !evidence.loading && <Notice>No usable answer is available for this selection.</Notice>
      )}
      <details className={box}>
        <summary className="cursor-pointer font-medium">All check outcomes</summary>
        <ul className="mt-3 space-y-2 text-sm">
          {history.data?.entries.map((e) => (
            <li key={e.id}>
              {time(e.at)} · {e.status}
              {e.failureCode ? ` · ${e.failureCode}` : ''}
              {e.kind === 'observation' && (
                <button
                  className="ml-3 underline"
                  onClick={() => {
                    select(e.id);
                  }}
                >
                  Open
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex gap-2">
          {cursor && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCursor(null);
              }}
            >
              Latest
            </Button>
          )}
          {history.data?.nextCursor && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCursor(history.data?.nextCursor ?? null);
              }}
            >
              Older checks
            </Button>
          )}
        </div>
      </details>
      {(project.canScan || canEditDraft) && history.data && (
        <details className={box}>
          <summary className="cursor-pointer font-medium">
            {canEditDraft ? 'Edit draft question' : 'Replace this question'}
          </summary>
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(async () => {
                if (canEditDraft) {
                  await api(
                    `/questions/${questionId ?? ''}`,
                    { text: replacement, expectedUpdatedAt: history.data?.question.updatedAt },
                    'PATCH',
                  );
                  setReplacement('');
                  return;
                }
                const result = await api<{ id: string }>(
                  `/questions/${questionId ?? ''}/replacement`,
                  {
                    text: replacement,
                  },
                );
                await navigate(`/app/questions/${result.id}`);
                setCursor(null);
                setReplacement('');
              });
            }}
          >
            <p className="text-sm text-muted-foreground">
              {canEditDraft
                ? 'A draft can be edited until its first attempt is claimed.'
                : 'The old question and its evidence will remain archived. The replacement starts a new baseline.'}
            </p>
            <Textarea
              required
              minLength={10}
              maxLength={500}
              value={replacement}
              onChange={(e) => {
                setReplacement(e.target.value);
              }}
            />
            <Button disabled={action.busy}>
              {canEditDraft ? 'Save draft' : 'Create replacement'}
            </Button>
          </form>
        </details>
      )}
    </section>
  );
}
function Answer({ observation: o, label }: { observation: V2Observation; label: string }) {
  const capture = o.capture;
  const cited = new Set(
    capture?.links.filter((l) => l.status === 'verified').flatMap((l) => l.sourceKeys),
  );
  function markedText(text: string, start: number) {
    return highlight(text, capture?.entities.flatMap((entity) => entity.matchedTerms) ?? []).map(
      (part, index) =>
        part.marked ? (
          <mark
            key={`${String(start)}-${String(index)}`}
            className="rounded bg-amber-100 text-inherit dark:bg-amber-900/40"
          >
            {part.text}
          </mark>
        ) : (
          part.text
        ),
    );
  }
  function textWithMarkers(part: NonNullable<V2Observation['capture']>['textParts'][number]) {
    const links =
      capture?.links
        .filter(
          (l) =>
            l.itemIndex === part.itemIndex &&
            l.contentIndex === part.contentIndex &&
            l.status === 'verified',
        )
        .sort((a, b) => a.start - b.start) ?? [];
    const fragments: ReactNode[] = [];
    let offset = 0;
    for (const link of links) {
      fragments.push(...markedText(part.text.slice(offset, link.start), offset));
      fragments.push(
        <a
          key={link.start}
          className="underline decoration-primary"
          href={`#source-${o.id}-${link.sourceKeys[0]?.replace(':', '-') ?? ''}`}
        >
          {part.text.slice(link.start, link.end)}
        </a>,
      );
      offset = link.end;
    }
    fragments.push(...markedText(part.text.slice(offset), offset));
    return fragments;
  }
  return (
    <article className={`${box} min-w-0 space-y-4`}>
      <header>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {label} · {time(o.capturedAt)}
        </p>
        <p className="mt-2 text-sm font-medium">{o.questionText}</p>
      </header>
      {!capture ? (
        <>
          <Notice>
            Legacy normalized answer. The original response and historical configuration were not
            retained. The question label may reflect later edits.
          </Notice>
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
            {o.legacyText ?? 'No answer text retained.'}
          </pre>
          <h3 className="font-medium">Legacy returned sources — citation use unverified</h3>
          <ul className="space-y-2 text-sm">
            {o.legacySources.map((source, index) => (
              <li key={index}>
                <a
                  className="break-all underline"
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {source.title ?? source.url}
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <ul className="flex flex-wrap gap-2 text-xs">
            {capture.entities.map((e) => (
              <li key={e.id} className="rounded-full border px-3 py-1">
                {e.name}: {e.matched ? 'match found' : 'no match found'}
              </li>
            ))}
          </ul>
          <div className="space-y-3">
            {capture.textParts.map((part) => (
              <pre
                key={`${String(part.itemIndex)}:${String(part.contentIndex)}`}
                className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed"
              >
                {textWithMarkers(part)}
              </pre>
            ))}
          </div>
          <section className="border-t pt-4">
            <h3 className="font-medium">Cited sources — matched by answer markers</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {cited.size
                ? `${String(cited.size)} linked source records. Linkage does not establish factual support.`
                : 'Citation use unverified.'}
            </p>
            {capture.citationStatus === 'unresolved' && (
              <p className="mt-2 text-sm">Some citation references could not be resolved.</p>
            )}
          </section>
          <section>
            <h3 className="font-medium">Returned sources</h3>
            {capture.sourceParseStatus === 'partial' && (
              <p className="text-sm text-amber-700">Some source data could not be read.</p>
            )}
            {capture.sources.length === 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                {capture.sourceParseStatus === 'complete'
                  ? 'No source records returned.'
                  : 'Source records unavailable.'}
              </p>
            )}
            <ul className="mt-3 space-y-3">
              {capture.sources.map((source) => (
                <li
                  id={`source-${o.id}-${source.key.replace(':', '-')}`}
                  key={source.key}
                  className="min-w-0 rounded-lg border p-3 text-sm"
                >
                  <a
                    className="break-words underline"
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      emitEvent('source_opened', o.id, { sourceKey: source.key });
                    }}
                  >
                    {source.title ?? source.hostname}
                  </a>
                  <p className="mt-1 break-all text-xs text-muted-foreground">{source.url}</p>
                  <p className="mt-1 text-xs">
                    {cited.has(source.key) ? 'Cited by matched marker' : 'Citation use unverified'}
                  </p>
                </li>
              ))}
            </ul>
          </section>
          <details className="border-t pt-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer">Capture metadata and methodology</summary>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-2">
              <dt>Provider</dt>
              <dd>Perplexity Agent API</dd>
              <dt>Model</dt>
              <dd className="break-all">{capture.model}</dd>
              <dt>Preset</dt>
              <dd>{o.context?.preset}</dd>
              <dt>Status</dt>
              <dd>{capture.providerStatus}</dd>
              <dt>Response ID</dt>
              <dd className="break-all">{capture.responseId}</dd>
              <dt>Output tokens</dt>
              <dd>
                {capture.outputTokens ?? 'Not reported'} / {o.context?.maxOutputTokens}
              </dd>
            </dl>
            {capture.outputTokens !== null &&
              o.context &&
              capture.outputTokens >= o.context.maxOutputTokens && (
                <p className="mt-2">Output reached the configured token limit.</p>
              )}
            <p className="mt-3">
              Text parts preserve returned whitespace and boundaries. Sources are records returned
              with this API response, not archived page contents.
            </p>
            <a className="mt-3 inline-block underline" href={`/api/v2/observations/${o.id}/raw`}>
              Download original response JSON
            </a>
          </details>
        </>
      )}
    </article>
  );
}
interface Billing {
  checkoutAvailable: boolean;
  portalAvailable: boolean;
  availabilityMessage: string | null;
  subscription: { status: string; testMode: boolean; endsAt: string | null } | null;
}
export function V2Settings() {
  const fixture = fixtureMode();
  const { data, reload } = useOutletContext<WorkspaceContext>();
  const billing = useResource<Billing>('/api/billing/status');
  const action = useAction(reload);
  const [identity, setIdentity] = useState<IdentityDraft | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [forfeit, setForfeit] = useState(false);
  if (!data.project) return <Navigate to="/app/onboarding" replace />;
  const value = identity ?? {
    brandName: data.project.brandName,
    canonicalDomain: data.project.canonicalDomain,
    competitors: data.project.competitors,
  };
  const locked = ['baseline', 'waiting', 'followup'].includes(data.trial?.state ?? '');
  async function billingAction(path: string) {
    if (fixture.requested) return;
    await action.run(async () => {
      const result = await api<{ url: string }>(`/api/billing/${path}`, {});
      const url = new URL(result.url);
      if (url.protocol !== 'https:') throw new Error('Invalid billing URL.');
      window.location.assign(url.href);
    });
  }
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <TrialStatus data={data} />
      <GeoSettingsPanel />
      <Failure error={action.error ?? billing.error} />
      <form
        className={`${box} space-y-4`}
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () => {
            await api(
              '/project',
              { ...value, expectedContextVersion: data.project?.contextVersion },
              'PATCH',
            );
            setIdentity(null);
          });
        }}
      >
        <h2 className="text-lg font-medium">Brand and competitors</h2>
        <IdentityFields value={value} set={setIdentity} disabled={locked} />
        <p className="text-sm text-muted-foreground">
          Future checks start a new comparison baseline when names, domains or competitors change.
          Saved evidence stays unchanged.
        </p>
        {locked ? (
          <Button
            type="button"
            variant="outline"
            disabled={action.busy}
            onClick={() => void action.run(() => api('/trial/cancel', {}))}
          >
            Stop trial to change configuration
          </Button>
        ) : (
          <Button disabled={action.busy}>Save configuration</Button>
        )}
      </form>
      <section className={`${box} space-y-4`}>
        <h2 className="text-lg font-medium">Monitoring and billing</h2>
        <p>$19/month · One project · Up to 10 active questions · Daily checks</p>
        <p className="text-sm text-muted-foreground">
          {data.usage.today}/{data.usage.dailyLimit} attempts today · {data.usage.month}/
          {data.usage.monthlyLimit} this calendar month. Daily allowance resets{' '}
          {time(data.usage.resetAt)}; monthly allowance resets {time(data.usage.monthlyResetAt)}{' '}
          (UTC boundaries).
        </p>
        <p className="text-sm">
          Subscription: {billing.data?.subscription?.status ?? 'No subscription'}
          {billing.data?.subscription?.testMode ? ' · Test-mode billing' : ''}
        </p>
        {billing.data?.availabilityMessage && <Notice>{billing.data.availabilityMessage}</Notice>}
        <div className="flex flex-wrap gap-3">
          {billing.data?.checkoutAvailable && (
            <Button
              className="h-auto min-h-9 max-w-full whitespace-normal"
              disabled={action.busy || fixture.requested}
              onClick={() => void billingAction('checkout')}
            >
              Continue daily monitoring — $19/month
            </Button>
          )}
          {billing.data?.portalAvailable && (
            <Button
              variant="outline"
              disabled={action.busy || fixture.requested}
              onClick={() => void billingAction('portal')}
            >
              Manage subscription
            </Button>
          )}
          <Button variant="ghost" onClick={() => void billing.reload()}>
            Refresh payment status
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          After monitoring stops, your saved evidence remains readable. A checkout redirect alone
          does not confirm payment.
        </p>
      </section>
      <details className={`${box} space-y-4`}>
        <summary className="cursor-pointer font-medium">Delete account permanently</summary>
        <p className="mt-4 text-sm">
          This removes your project, evidence and product events. Cancel renewal in the billing
          portal first. You must have signed in within the last 15 minutes.
        </p>
        <label className="mt-3 block text-sm">
          Type DELETE
          <Input
            value={confirmation}
            onChange={(e) => {
              setConfirmation(e.target.value);
            }}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={forfeit}
            onChange={(e) => {
              setForfeit(e.target.checked);
            }}
          />
          I forfeit any remaining access and understand my evidence will be deleted.
        </label>
        <Button
          variant="destructive"
          disabled={confirmation !== 'DELETE' || !forfeit || action.busy || fixture.requested}
          onClick={() =>
            void action.run(async () => {
              if (fixture.requested) return;
              await api('/api/account', { confirmation, forfeitRemainingAccess: true }, 'DELETE');
              window.location.assign('/');
            })
          }
        >
          Delete account
        </Button>
        {fixture.requested && (
          <p className="text-xs text-muted-foreground">
            Billing redirects and account deletion are unavailable in the synthetic fixture. Use
            Exit fixture to return to the live account.
          </p>
        )}
      </details>
    </section>
  );
}
export function LegacyEvidenceRedirect() {
  const [params] = useSearchParams();
  const id = params.get('observation');
  const evidence = useResource<V2ObservationPayload>(id ? `/observations/${id}` : null);
  if (!id) return <Navigate to="/app/questions" replace />;
  if (evidence.data)
    return (
      <Navigate
        to={`/app/questions/${evidence.data.observation.questionId}?observation=${id}`}
        replace
      />
    );
  return evidence.error ? (
    <Failure error={evidence.error} />
  ) : (
    <p role="status">Opening saved evidence…</p>
  );
}

import {
  BarChart3,
  CircleAlert,
  CreditCard,
  FileText,
  ListChecks,
  LogOut,
  Menu,
  RefreshCw,
  Settings,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { Button } from '@/client/components/ui/button';
import { Separator } from '@/client/components/ui/separator';
import { Skeleton } from '@/client/components/ui/skeleton';
import type { DashboardContext } from './dashboard-context';
import type { DashboardPayload, LoadState } from './dashboard-view';
import { useDashboard } from './use-dashboard';

const navigation = [
  { Icon: BarChart3, label: 'Overview', path: '/app/overview' },
  { Icon: ListChecks, label: 'Prompts', path: '/app/prompts' },
  { Icon: FileText, label: 'Responses', path: '/app/responses' },
  { Icon: CreditCard, label: 'Billing', path: '/app/billing' },
  { Icon: Settings, label: 'Settings', path: '/app/settings' },
] as const;

function Logo({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={`flex items-center gap-2 ${className ?? ''}`}
      aria-label="CiteScout home"
    >
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-bold italic text-primary-foreground">
        CS
      </span>
      <span className="text-sm font-bold tracking-tight">CiteScout</span>
    </Link>
  );
}

/**
 * The application frame: a persistent sidebar plus a single <main> that hosts
 * whichever route is active. Onboarding renders as a route inside this frame
 * (it is a full-screen page with its own id="main"), so switching tabs always
 * replaces the viewport instead of stacking views.
 */
export function AppShell() {
  const navigate = useNavigate();
  const { state, reload } = useDashboard();
  const signedOut = state.status === 'unauthenticated';
  const [mobileOpen, setMobileOpen] = useState(false);

  const accountLabel = state.status === 'ready' ? state.data.brandName : null;

  return (
    <div className="flex min-h-svh w-full bg-background">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col border-r bg-sidebar transition-transform lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b px-4">
          <Logo />
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Close navigation"
            onClick={() => {
              setMobileOpen(false);
            }}
          >
            <X className="size-4" />
          </Button>
        </div>

        <nav className="flex flex-col gap-0.5 p-2" aria-label="Application">
          {navigation.map(({ Icon, label, path }) => (
            <NavLink
              key={label}
              to={path}
              onClick={() => {
                setMobileOpen(false);
              }}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground'
                }`
              }
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-1 p-2">
          {state.status === 'loading' && (
            <div className="px-2.5 py-1">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-1.5 h-4 w-28" />
            </div>
          )}
          {accountLabel !== null && (
            <div className="px-2.5 py-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Project
              </p>
              <p className="truncate text-sm font-medium">{accountLabel}</p>
            </div>
          )}
          {state.status === 'onboarding' && (
            <div className="px-2.5 py-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Project
              </p>
              <Link
                to="/app/onboarding"
                className="mt-0.5 inline-flex items-center text-xs font-medium text-amber-800 hover:text-amber-950"
              >
                Setup pending →
              </Link>
            </div>
          )}
          <Separator className="my-1" />
          {signedOut ? (
            <Link
              to="/login"
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Sign in
            </Link>
          ) : (
            <button
              type="button"
              className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
              onClick={() => {
                void fetch('/api/auth/sign-out', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                }).then(() => {
                  reload();
                  void navigate('/');
                });
              }}
            >
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </button>
          )}
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-foreground/20 lg:hidden"
          aria-hidden="true"
          onClick={() => {
            setMobileOpen(false);
          }}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 border-b px-4 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open navigation"
            onClick={() => {
              setMobileOpen(true);
            }}
          >
            <Menu className="size-4" />
          </Button>
          <Logo />
        </header>
        {!signedOut && state.status === 'onboarding' && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-amber-50/50 px-4 py-2 text-xs text-amber-900 sm:px-6">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-amber-500" aria-hidden="true" />
              <span>
                <strong>Project setup pending:</strong> Add your brand and buyer prompts to begin
                measuring AI search visibility.
              </span>
            </div>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="h-7 border-amber-300 bg-white text-xs text-amber-950 hover:bg-amber-50"
            >
              <Link to="/app/onboarding">Complete setup (2 min) →</Link>
            </Button>
          </div>
        )}
        <main className="min-w-0 flex-1">
          {signedOut ? (
            <PageState state={state} onRetry={reload} />
          ) : (
            <Outlet context={{ state, reload } satisfies DashboardContext} />
          )}
        </main>
      </div>
    </div>
  );
}

interface PageStateProps {
  state: LoadState<DashboardPayload>;
  onRetry: () => void;
}

export function PageState({ state, onRetry }: PageStateProps) {
  if (state.status === 'loading')
    return (
      <p role="status" aria-live="polite" className="p-8 text-sm text-muted-foreground">
        Loading your workspace…
      </p>
    );

  if (state.status === 'onboarding')
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Set up your first project</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Add your brand, competitors, and buyer-style prompts to begin monitoring.
        </p>
        <Button asChild className="mt-6">
          <Link to="/app/onboarding">Start setup</Link>
        </Button>
      </div>
    );

  if (state.status === 'unauthenticated')
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Session expired</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in again to continue to your workspace.
        </p>
        <Button asChild className="mt-6">
          <Link to="/login">Sign in</Link>
        </Button>
      </div>
    );

  if (state.status === 'ready') return null;

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        <CircleAlert className="size-5 text-destructive" aria-hidden="true" />
        Something went wrong
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{state.message}</p>
      <Button
        variant="outline"
        className="mt-6"
        onClick={() => {
          onRetry();
        }}
      >
        <RefreshCw className="size-4" aria-hidden="true" />
        Retry
      </Button>
    </div>
  );
}

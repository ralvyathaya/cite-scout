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
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/client/components/ui/dialog';
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
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const close = () => {
      if (desktop.matches) setMobileOpen(false);
    };
    desktop.addEventListener('change', close);
    return () => {
      desktop.removeEventListener('change', close);
    };
  }, []);

  const accountLabel = state.status === 'ready' ? state.data.brandName : null;

  const sidebar = (
    <>
      {' '}
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
            disabled={signingOut}
            aria-busy={signingOut}
            onClick={() => {
              setSigningOut(true);
              void fetch('/api/auth/sign-out', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
              })
                .then((response) => {
                  if (!response.ok) throw new Error('Could not sign out.');
                  reload();
                  void navigate('/');
                })
                .catch(() => {
                  toast.error('Could not sign out. Please try again.');
                })
                .finally(() => {
                  setSigningOut(false);
                });
            }}
          >
            <LogOut className="size-4" aria-hidden="true" />
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        )}
      </div>
    </>
  );
  return (
    <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
      <div className="flex min-h-svh w-full bg-background">
        <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar lg:flex">
          {sidebar}
        </aside>
        <DialogContent
          showCloseButton={false}
          className="inset-y-0 left-0 top-0 flex h-svh w-72 max-w-[calc(100%-3rem)] translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-r bg-sidebar p-0 sm:max-w-72"
        >
          <DialogTitle className="sr-only">Workspace navigation</DialogTitle>
          <DialogDescription className="sr-only">
            Navigate your CiteScout workspace.
          </DialogDescription>
          <aside className="flex h-full flex-col">{sidebar}</aside>
        </DialogContent>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center gap-2 border-b px-4 lg:hidden">
            <DialogTrigger asChild>
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
            </DialogTrigger>
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
          <main id="main" className="min-w-0 flex-1">
            {signedOut ? (
              <PageState state={state} onRetry={reload} />
            ) : (
              <Outlet context={{ state, reload } satisfies DashboardContext} />
            )}
          </main>
        </div>
      </div>
    </Dialog>
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

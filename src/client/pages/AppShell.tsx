import {
  BarChart3,
  ChevronRight,
  CircleAlert,
  CreditCard,
  FileText,
  ListChecks,
  LifeBuoy,
  LogOut,
  Menu,
  RefreshCw,
  Settings,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/client/components/ui/dialog';
import { Button } from '@/client/components/ui/button';
import { BrandLogo } from '@/client/components/BrandLogo';
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
      <BrandLogo />
    </Link>
  );
}

/** One route viewport, with navigation that stays reachable while the document scrolls. */
export function AppShell() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { state, reload } = useDashboard();
  const signedOut = state.status === 'unauthenticated';
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [pathname]);
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
  const activePage = navigation.find((item) => item.path === pathname)?.label ?? 'Project setup';

  const sidebar = (
    <>
      <div className="flex h-16 shrink-0 items-center justify-between border-b px-5">
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
      {accountLabel !== null && (
        <Link
          to="/app/settings"
          onClick={() => {
            setMobileOpen(false);
          }}
          aria-label={`Workspace settings for ${accountLabel}`}
          className="m-3 flex shrink-0 items-center gap-3 rounded-lg border bg-background p-3 transition-colors hover:border-foreground/30"
        >
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted text-sm font-semibold"
            aria-hidden="true"
          >
            {accountLabel.slice(0, 2).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{accountLabel}</span>
            {state.status === 'ready' && (
              <span className="block truncate text-xs text-muted-foreground">
                {state.data.canonicalDomain}
              </span>
            )}
          </span>
        </Link>
      )}
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-label="Application">
        {navigation.map(({ Icon, label, path }, index) => (
          <div key={path}>
            {(index === 0 || index === 3) && (
              <p
                className={`px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ${index === 3 ? 'mt-6' : ''}`}
              >
                {index === 0 ? 'Monitor' : 'Account'}
              </p>
            )}
            <NavLink
              to={path}
              onClick={() => {
                setMobileOpen(false);
              }}
              className={({ isActive }) =>
                `mb-1 flex min-h-10 items-center gap-3 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-border bg-background text-sidebar-accent-foreground'
                    : 'border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-foreground'
                }`
              }
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </NavLink>
          </div>
        ))}
      </nav>
      <div className="mt-auto flex shrink-0 flex-col gap-1 border-t p-3">
        {state.status === 'loading' && (
          <div className="px-2.5 py-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-1.5 h-4 w-28" />
          </div>
        )}
        {state.status === 'ready' && (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            <span
              className={`mr-2 inline-block size-1.5 rounded-full ${state.data.entitlement.canScan ? 'bg-emerald-600' : 'bg-zinc-400'}`}
              aria-hidden="true"
            />
            {state.data.entitlement.canScan ? 'Monitoring enabled' : 'Read-only workspace'}
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
      <div className="flex min-h-svh w-full bg-zinc-50/60">
        <aside
          className="sticky top-0 hidden h-svh w-60 shrink-0 self-start flex-col border-r bg-zinc-50 lg:flex"
          aria-label="Workspace sidebar"
        >
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
          <header
            className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b bg-background px-4 sm:px-6 lg:px-8"
            aria-label="Workspace header"
          >
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open navigation"
                className="lg:hidden"
                onClick={() => {
                  setMobileOpen(true);
                }}
              >
                <Menu className="size-4" />
              </Button>
            </DialogTrigger>
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span className="hidden text-muted-foreground sm:inline">Workspace</span>
              <ChevronRight
                className="hidden size-3.5 text-muted-foreground sm:block"
                aria-hidden="true"
              />
              <span className="truncate font-medium">{activePage}</span>
            </div>
            <a
              href="mailto:support@cite-scout.com"
              className="ml-auto flex min-h-9 shrink-0 items-center gap-2 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Contact support"
            >
              <LifeBuoy className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Help & support</span>
            </a>
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
          <main id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
            <div className="mx-auto w-full max-w-[1440px]">
              {signedOut ? (
                <PageState state={state} onRetry={reload} />
              ) : (
                <Outlet context={{ state, reload } satisfies DashboardContext} />
              )}
            </div>
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

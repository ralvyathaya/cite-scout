import {
  BarChart3,
  CircleAlert,
  CreditCard,
  FileText,
  ListChecks,
  LogOut,
  RefreshCw,
  Settings,
} from 'lucide-react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import type { DashboardPayload, LoadState } from './dashboard-view';

const navigation = [
  { Icon: BarChart3, label: 'Overview', path: '/app/overview' },
  { Icon: ListChecks, label: 'Prompts', path: '/app/prompts' },
  { Icon: FileText, label: 'Responses', path: '/app/responses' },
  { Icon: CreditCard, label: 'Billing', path: '/app/billing' },
  { Icon: Settings, label: 'Settings', path: '/app/settings' },
] as const;

export function AppShell() {
  const navigate = useNavigate();

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link className="logo" to="/">
          <span>PW</span>PromptWatch
        </Link>
        <nav aria-label="Application">
          {navigation.map(({ Icon, label, path }) => (
            <NavLink key={label} to={path}>
              <Icon size={16} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => {
            void fetch('/api/auth/sign-out', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            }).then(() => {
              void navigate('/');
            });
          }}
        >
          <LogOut size={15} aria-hidden="true" />
          Sign out
        </button>
      </aside>
      <main className="app-main" id="main">
        <Outlet />
      </main>
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
      <p role="status" aria-live="polite" className="app-state">
        Loading your workspaceâ€¦
      </p>
    );

  if (state.status === 'onboarding')
    return (
      <div className="app-state">
        <h1>Set up your first project</h1>
        <p>Add your brand, competitors, and buyer-style prompts to begin monitoring.</p>
        <Link className="button" to="/app/onboarding">
          Start setup
        </Link>
      </div>
    );

  if (state.status === 'unauthenticated')
    return (
      <div className="app-state">
        <h1>Session expired</h1>
        <p>Sign in again to continue to your workspace.</p>
        <Link className="button" to="/login">
          Sign in
        </Link>
      </div>
    );

  if (state.status === 'ready') return null;

  return (
    <div className="app-state">
      <h1>
        <CircleAlert size={20} aria-hidden="true" /> Something went wrong
      </h1>
      <p>{state.message}</p>
      <button
        type="button"
        className="button"
        onClick={() => {
          onRetry();
        }}
      >
        <RefreshCw size={15} aria-hidden="true" /> Retry
      </button>
    </div>
  );
}

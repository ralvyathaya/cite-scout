import { BarChart3, CreditCard, FileText, ListChecks, LogOut, Settings } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router';

const navigation = [
  { Icon: BarChart3, label: 'Overview', path: '/app/overview' },
  { Icon: ListChecks, label: 'Prompts', path: '/app/prompts' },
  { Icon: FileText, label: 'Responses', path: '/app/responses' },
  { Icon: CreditCard, label: 'Billing', path: '/app/billing' },
  { Icon: Settings, label: 'Settings', path: '/app/settings' },
] as const;

export function AppShell() {
  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link className="logo" to="/">
          <span>PW</span>PromptWatch
        </Link>
        <nav>
          {navigation.map(({ Icon, label, path }) => (
            <NavLink key={label} to={path}>
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
        <button>
          <LogOut size={15} />
          Sign out
        </button>
      </aside>
      <main className="app-main" id="main">
        <Outlet />
      </main>
    </div>
  );
}

export function AppOverview() {
  return (
    <>
      <header className="app-header">
        <div>
          <p className="eyebrow">OrbitCal · Last 14 days</p>
          <h1>Visibility overview</h1>
        </div>
        <button className="button">Run today’s scan</button>
      </header>
      <div className="notice">
        <b>Trial results are ready.</b>
        <span>Upgrade to begin daily monitoring and unlock historical trends.</span>
        <Link to="/app/billing">Upgrade for $19/month →</Link>
      </div>
      <section className="dashboard">
        <div className="metric-strip">
          <div className="score">
            <span>Visibility score</span>
            <strong>62.5</strong>
            <small>Initial observation</small>
          </div>
          <div>
            <span>Mention rate</span>
            <strong>67%</strong>
            <small>2 of 3 prompts</small>
          </div>
          <div>
            <span>Share of voice</span>
            <strong>29%</strong>
            <small>Tracked entities</small>
          </div>
          <div>
            <span>Coverage</span>
            <strong>100%</strong>
            <small>3 successful</small>
          </div>
        </div>
        <div className="empty-chart">
          <BarChart3 />
          <h2>Your trend starts here</h2>
          <p>The first trial observation is preserved. Daily points begin after upgrading.</p>
        </div>
      </section>
    </>
  );
}

export function PromptsPage() {
  return (
    <AppList
      title="Monitored prompts"
      action="Add prompt"
      items={[
        'Best scheduling tool for independent consultants',
        'Alternatives to Calendly for freelancers',
        'Simple client booking software',
      ]}
    />
  );
}
export function ResponsesPage() {
  return (
    <AppList
      title="Response archive"
      items={[
        'Best scheduling tool for independent consultants — Recommended',
        'Alternatives to Calendly for freelancers — Mentioned',
        'Simple client booking software — Absent',
      ]}
    />
  );
}
export function BillingPage() {
  return (
    <>
      <header className="app-header">
        <div>
          <p className="eyebrow">Plan and invoices</p>
          <h1>Billing</h1>
        </div>
      </header>
      <div className="settings-panel">
        <h2>Start daily monitoring</h2>
        <p>
          $19 USD per month. Checkout is hosted securely by Lemon Squeezy. Access activates only
          after payment is verified by a signed webhook.
        </p>
        <button className="button">Open secure checkout</button>
      </div>
    </>
  );
}
export function SettingsPage() {
  return (
    <AppList
      title="Project settings"
      items={[
        'Brand: OrbitCal',
        'Domain: orbitcal.example',
        'Competitors: Calendly, Cal.com, SavvyCal',
      ]}
    />
  );
}
function AppList({ title, action, items }: { title: string; action?: string; items: string[] }) {
  return (
    <>
      <header className="app-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>{title}</h1>
        </div>
        {action && <button className="button">{action}</button>}
      </header>
      <div className="settings-panel">
        {items.map((item) => (
          <div className="setting-row" key={item}>
            <span>{item}</span>
            <button>Manage</button>
          </div>
        ))}
      </div>
    </>
  );
}

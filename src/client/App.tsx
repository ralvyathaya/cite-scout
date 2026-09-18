import { ArrowRight, Check, ChevronDown, CircleDot, ExternalLink, Menu, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router';
import { demoDays } from '../domain/demo';
import { brand } from '../shared/brand';
import { ErrorBoundary } from './ErrorBoundary';
import { OfflineBanner } from './OfflineBanner';
import { AppShell } from './pages/AppShell';
import { AppOverview } from './pages/Overview';
import { PromptsPage, ResponsesPage } from './pages/Workspace';
import { BillingPage, SettingsPage } from './pages/BillingSettings';
import { Login } from './pages/Login';
import { Onboarding } from './pages/Onboarding';
import { usePageTitle } from './use-page-title';

const visibility = demoDays.map((day) => day.visibilityScore);

/** Demo fixtures show dates relative to today so the landing never looks stale. */
function relativeDayLabel(offsetFromToday: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - offsetFromToday);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function Logo() {
  return (
    <Link className="logo" to="/" aria-label={`${brand.name} home`}>
      <span>CS</span>
      {brand.name}
    </Link>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header">
      <div className="shell nav-wrap">
        <Logo />
        <button
          className="menu-button"
          onClick={() => {
            setOpen(!open);
          }}
          aria-expanded={open}
          aria-label="Toggle navigation"
        >
          {open ? <X /> : <Menu />}
        </button>
        <nav className={open ? 'nav open' : 'nav'} aria-label="Main navigation">
          <Link to="/demo">Demo</Link>
          <Link to="/pricing">Pricing</Link>
          <Link to="/login">Sign in</Link>
          <Link className="button small" to="/login">
            Check my visibility <ArrowRight size={15} />
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Sparkline() {
  const points = visibility
    .map(
      (value, index) => `${String((index / (visibility.length - 1)) * 600)},${String(145 - value)}`,
    )
    .join(' ');
  return (
    <div className="chart">
      <svg
        viewBox="0 0 600 150"
        role="img"
        aria-label="Example visibility score rising from 42 to 84 over fourteen days"
      >
        <defs>
          <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#145cff" stopOpacity=".22" />
            <stop offset="1" stopColor="#145cff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,150 ${points} 600,150`} fill="url(#fill)" />
        <polyline
          points={points}
          fill="none"
          stroke="#145cff"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="chart-axis">
        <span>{relativeDayLabel(13)}</span>
        <span>{relativeDayLabel(0)}</span>
      </div>
    </div>
  );
}

function DashboardPreview({ demo = false }: { demo?: boolean }) {
  return (
    <section className="dashboard" aria-label="Example visibility dashboard">
      <div className="dash-top">
        <div>
          <p className="eyebrow">{demo ? 'Illustrative demo data' : 'Example dashboard'}</p>
          <h2>OrbitCal visibility</h2>
        </div>
        <div className="period">
          Last 14 days <span>UTC</span>
        </div>
      </div>
      <div className="metric-strip">
        <div className="score">
          <span>Visibility score</span>
          <strong>84.2</strong>
          <small>+8.4 vs previous period</small>
        </div>
        <div>
          <span>Mention rate</span>
          <strong>70%</strong>
          <small>7 of 10 prompts</small>
        </div>
        <div>
          <span>Share of voice</span>
          <strong>31%</strong>
          <small>Across tracked entities</small>
        </div>
        <div>
          <span>Coverage</span>
          <strong>90%</strong>
          <small>1 source timed out</small>
        </div>
      </div>
      <div className="dash-grid">
        <div className="trend">
          <div className="section-heading">
            <h3>Visibility trend</h3>
            <span className="status">
              <CircleDot size={13} /> Partial scan
            </span>
          </div>
          <Sparkline />
        </div>
        <div className="share">
          <h3>Share of voice</h3>
          {(
            [
              ['OrbitCal', 31],
              ['Calendly', 38],
              ['Cal.com', 19],
              ['SavvyCal', 12],
            ] as const
          ).map(([name, value]) => (
            <div className="bar-row" key={name}>
              <div>
                <span>{name}</span>
                <b>{value}%</b>
              </div>
              <div className="bar">
                <i style={{ width: `${String(value)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="result-head">
        <h3>Prompt observations</h3>
        <span>Perplexity Agent API · fast preset</span>
      </div>
      <div className="results">
        <div className="result-row header">
          <span>Prompt</span>
          <span>Brand status</span>
          <span>First mention</span>
        </div>
        <div className="result-row">
          <span>Best scheduling tool for independent consultants</span>
          <span className="positive">
            <Check size={14} /> Recommended
          </span>
          <span>#2</span>
        </div>
        <div className="result-row">
          <span>Calendly alternatives for solo consultants</span>
          <span className="neutral">Mentioned</span>
          <span>#3</span>
        </div>
        <div className="result-row">
          <span>Simple client booking software</span>
          <span className="absent">Absent</span>
          <span>—</span>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      number: '01',
      title: 'Configure your prompts',
      body: 'Add your brand, up to three competitors, and the buyer-style questions your customers actually ask AI assistants.',
    },
    {
      number: '02',
      title: 'We observe daily',
      body: 'Every enabled prompt is run once per UTC day against the Perplexity Agent API, with the full answer and citations stored.',
    },
    {
      number: '03',
      title: 'Inspect the evidence',
      body: 'Track visibility over time, compare share of voice, and open any stored answer to see exactly why a metric moved.',
    },
  ] as const;

  return (
    <section className="how-it-works shell" aria-labelledby="how-it-works-heading">
      <p className="eyebrow" id="how-it-works-heading">
        How CiteScout works
      </p>
      <ol className="steps-row">
        {steps.map((step) => (
          <li key={step.number}>
            <span>{step.number}</span>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Landing() {
  usePageTitle();
  return (
    <>
      <Header />
      <main id="main">
        <section className="hero shell">
          <div className="hero-copy">
            <p className="eyebrow">AI search visibility, without the enterprise contract</p>
            <h1>
              When founders ask AI for your category, <em>who gets recommended?</em>
            </h1>
            <p className="lede">
              Track how your brand appears in Perplexity answers over time, compare competitors, and
              inspect every source.
            </p>
            <div className="actions">
              <Link className="button" to="/login">
                Check my visibility <ArrowRight size={17} />
              </Link>
              <Link className="text-link" to="/demo">
                Explore the live demo <ExternalLink size={15} />
              </Link>
            </div>
            <p className="fine">
              One genuine trial scan. No card required. Monitoring starts at $19/month.
            </p>
          </div>
          <div className="hero-note">
            <span>Not another one-off AI answer</span>
            <p>
              CiteScout builds a daily evidence trail: what appeared, what disappeared, and which
              sources shaped the response.
            </p>
          </div>
        </section>
        <div className="preview-wrap shell">
          <DashboardPreview />
        </div>
        <HowItWorks />
        <section className="manifesto shell">
          <p className="eyebrow">The useful difference</p>
          <h2>
            One answer is an anecdote.
            <br />
            Fourteen days is a signal.
          </h2>
          <div className="feature-columns">
            <article>
              <span>01</span>
              <h3>Track movement</h3>
              <p>
                See whether your brand is gaining visibility, losing ground, or appearing
                inconsistently across buyer-style prompts.
              </p>
            </article>
            <article>
              <span>02</span>
              <h3>Watch competitors</h3>
              <p>
                Compare share of voice and first-mention order against the products prospects see
                alongside yours.
              </p>
            </article>
            <article>
              <span>03</span>
              <h3>Audit the evidence</h3>
              <p>
                Open the stored answer and every returned citation. No mysterious score without the
                underlying observation.
              </p>
            </article>
          </div>
        </section>
        <section className="honesty">
          <div className="shell honesty-grid">
            <p className="eyebrow">Honest by design</p>
            <div>
              <h2>
                Directional intelligence,
                <br />
                not a fabricated ranking.
              </h2>
              <p>
                AI answers are nondeterministic. CiteScout records observations from the supported
                Perplexity Agent API. It does not claim to reproduce the Perplexity consumer app,
                ChatGPT, Claude, or Google AI Overviews.
              </p>
            </div>
          </div>
        </section>
        <section className="price-cta shell">
          <div>
            <p className="eyebrow">Focused and affordable</p>
            <h2>
              Replace the spreadsheet ritual,
              <br />
              not your entire SEO stack.
            </h2>
          </div>
          <div className="price">
            <strong>$19</strong>
            <span>/ month</span>
            <p>10 daily prompts · 3 competitors · full history</p>
            <Link className="button" to="/pricing">
              See what is included <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function Demo() {
  usePageTitle('Demo');
  return (
    <>
      <Header />
      <main className="page shell" id="main">
        <div className="page-title">
          <p className="eyebrow">Illustrative demo data</p>
          <h1>
            See the pattern,
            <br />
            not just the snapshot.
          </h1>
          <p>
            OrbitCal is a fictional scheduling product. This dashboard demonstrates fourteen days of
            changing AI-search visibility and never calls Perplexity.
          </p>
        </div>
        <DashboardPreview demo />
        <p className="fine">
          Illustrative demo data only. CiteScout observes the Perplexity Agent API and does not
          claim to reproduce the Perplexity consumer application, ChatGPT, Claude, or Google AI
          Overviews. AI answers are nondeterministic, so these numbers are directional observations
          rather than guaranteed rankings.
        </p>
      </main>
      <Footer />
    </>
  );
}

const pricingFaq = [
  {
    question: 'Does CiteScout monitor ChatGPT, Claude, or Google AI Overviews?',
    answer:
      'No. CiteScout observes the supported Perplexity Agent API only, and every number in your dashboard comes from a stored, auditable Perplexity answer. We say this openly because a monitoring tool that overstates its coverage is worse than no tool.',
  },
  {
    question: 'What is the free trial, exactly?',
    answer:
      'One genuine trial scan per account, covering up to three of your prompts, run against the real Perplexity API. No card required. You keep the results whether or not you subscribe.',
  },
  {
    question: 'Can I change my prompts and competitors later?',
    answer:
      'Yes, any time. Each enabled prompt is observed once per UTC day, so changes take effect on the next daily scan. You can have up to ten enabled prompts and three competitors on the single plan.',
  },
  {
    question: 'Can I cancel anytime?',
    answer:
      'Yes, from the self-serve billing portal. If you cancel, you keep access until the end of the paid period, and your historical answers stay available afterwards — we never delete your data because a subscription ended.',
  },
  {
    question: 'Why is it only $19/month when competitors charge hundreds?',
    answer:
      'CiteScout is deliberately focused: one project, one provider, daily observations. That focus keeps provider costs low, and we pass that on instead of building an enterprise sales motion.',
  },
  {
    question: 'What if my brand is missing from an answer?',
    answer:
      'That is exactly what CiteScout surfaces. You will see the absence per prompt over time, alongside which competitors were mentioned and which sources the AI cited — the starting point for improving your visibility.',
  },
] as const;

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="faq" aria-labelledby="faq-heading">
      <div className="shell">
        <p className="eyebrow" id="faq-heading">
          Frequently asked questions
        </p>
        <div className="faq-list">
          {pricingFaq.map((item, index) => {
            const isOpen = open === index;
            return (
              <div className="faq-item" key={item.question}>
                <h3>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => {
                      setOpen(isOpen ? null : index);
                    }}
                  >
                    {item.question}
                    <ChevronDown
                      size={16}
                      aria-hidden="true"
                      className={isOpen ? 'faq-chevron open' : 'faq-chevron'}
                    />
                  </button>
                </h3>
                {isOpen && <p>{item.answer}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  usePageTitle('Pricing');
  return (
    <>
      <Header />
      <main className="page shell narrow" id="main">
        <p className="eyebrow">One plan. Predictable cost.</p>
        <h1>
          Useful monitoring
          <br />
          without a sales call.
        </h1>
        <div className="pricing-panel">
          <div>
            <span>CiteScout Monitor</span>
            <strong>
              $19 <small>USD / month</small>
            </strong>
            <p>For founders and small teams who need evidence, not another enterprise dashboard.</p>
          </div>
          <ul>
            {[
              'One active project',
              '10 enabled prompts',
              '3 tracked competitors',
              'One observation per prompt per UTC day',
              'Historical trends and raw answer archive',
              'Secure self-serve billing',
              'Cancel anytime, keep your history',
            ].map((item) => (
              <li key={item}>
                <Check size={16} />
                {item}
              </li>
            ))}
          </ul>
          <Link className="button" to="/login">
            Start with a trial scan <ArrowRight size={16} />
          </Link>
        </div>
      </main>
      <Faq />
      <Footer />
    </>
  );
}

function Privacy() {
  usePageTitle('Privacy policy');
  return (
    <Legal title="Privacy policy">
      <p>
        CiteScout stores the prompts you configure and the provider responses returned for your
        account. Prompts are sent to Perplexity for processing.
      </p>
      <p>
        Authentication emails are processed by Resend. Billing is processed by Lemon Squeezy.
        CiteScout does not store payment-card data.
      </p>
      <p>
        You can request account and product-data deletion from settings at any time. Minimal billing
        identifiers may be retained where legally or operationally required.
      </p>
      <p>
        Questions, data-access requests, or deletion help:{' '}
        <a href="mailto:support@cite-scout.com">support@cite-scout.com</a>
      </p>
    </Legal>
  );
}
function Terms() {
  usePageTitle('Terms of service');
  return (
    <Legal title="Terms of service">
      <p>
        CiteScout provides directional observations from the Perplexity Agent API. AI-generated
        answers are nondeterministic and are not guaranteed rankings or exact copies of any consumer
        AI product.
      </p>
      <p>
        Usage is subject to configured prompt, daily, and monthly limits. Customers remain
        responsible for their prompts, domains, and use of the resulting research.
      </p>
      <p>
        Billing, refunds, and cancellation: subscriptions renew monthly and can be cancelled at any
        time from the self-serve billing portal. Cancelling stops future charges immediately and
        preserves access until the end of the paid period. Because each observation is a live
        third-party API call, completed scans are not refundable, but if something is clearly broken
        on our side, email support@cite-scout.com and we will make it right.
      </p>
      <p>
        Contact: <a href="mailto:support@cite-scout.com">support@cite-scout.com</a>
      </p>
    </Legal>
  );
}
function Legal({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <Header />
      <main className="page shell narrow legal" id="main">
        <p className="eyebrow">Effective September 16, 2026</p>
        <h1>{title}</h1>
        <div>{children}</div>
      </main>
      <Footer />
    </>
  );
}

function Footer() {
  return (
    <footer>
      <div className="shell footer-grid">
        <Logo />
        <p>AI visibility observations from the Perplexity API.</p>
        <nav aria-label="Footer">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <a href="mailto:support@cite-scout.com">Support</a>
        </nav>
      </div>
      <div className="shell footer-credits">
        <span>© {String(new Date().getUTCFullYear())} CiteScout. All rights reserved.</span>
        <span className="footer-buildgames">Built for The Build Games</span>
      </div>
    </footer>
  );
}

function MarketingNotFound() {
  usePageTitle('Page not found');
  return (
    <>
      <Header />
      <main className="page shell narrow" id="main">
        <p className="eyebrow">404</p>
        <h1>Page not found</h1>
        <p className="lede">
          That page does not exist. It may have moved, or the link you followed is out of date.
        </p>
        <div className="actions">
          <Link className="button" to="/">
            Back to home <ArrowRight size={16} />
          </Link>
          <Link className="text-link" to="/demo">
            Explore the demo
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}

export function App() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <OfflineBanner />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/demo" element={<Demo />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route
          path="/app"
          element={
            <ErrorBoundary>
              <AppShell />
            </ErrorBoundary>
          }
        >
          <Route index element={<Navigate to="/app/overview" replace />} />
          <Route path="onboarding" element={<Onboarding />} />
          <Route path="overview" element={<AppOverview />} />
          <Route path="prompts" element={<PromptsPage />} />
          <Route path="responses" element={<ResponsesPage />} />
          <Route path="billing" element={<BillingPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<MarketingNotFound />} />
      </Routes>
    </>
  );
}

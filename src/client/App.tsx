import { ArrowRight, Check, ChevronDown, ExternalLink, Menu, TrendingUp, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router';
import { Badge } from '@/client/components/ui/badge';
import { Button } from '@/client/components/ui/button';
import { Card, CardContent } from '@/client/components/ui/card';
import { Separator } from '@/client/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/client/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/client/components/ui/tabs';
import {
  GoogleIcon,
  NotionIcon,
  PerplexityIcon,
  RedditIcon,
  WikipediaIcon,
  XIcon,
  YoutubeIcon,
} from '@/client/components/brand-icons';
import { StatusBadge } from '@/client/components/status-badge';
import { brand } from '@/shared/brand';
import { demoDays } from '@/domain/demo';
import { ErrorBoundary } from '@/client/ErrorBoundary';
import { OfflineBanner } from '@/client/OfflineBanner';
import { AppShell } from '@/client/pages/AppShell';
import { AppOverview } from '@/client/pages/Overview';
import { PromptsPage, ResponsesPage } from '@/client/pages/Workspace';
import { BillingPage, SettingsPage } from '@/client/pages/BillingSettings';
import { Login } from '@/client/pages/Login';
import { Onboarding } from '@/client/pages/Onboarding';
import { usePageTitle } from '@/client/use-page-title';

const visibility = demoDays.map((day) => day.visibilityScore);

function relativeDayLabel(offsetFromToday: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - offsetFromToday);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2" aria-label={`${brand.name} home`}>
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-bold italic text-primary-foreground">
        CS
      </span>
      <span className="text-sm font-bold tracking-tight">{brand.name}</span>
    </Link>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  const links = (
    <>
      <Link
        to="/demo"
        className="text-sm font-medium text-muted-foreground hover:text-foreground"
        onClick={() => {
          setOpen(false);
        }}
      >
        Demo
      </Link>
      <Link
        to="/pricing"
        className="text-sm font-medium text-muted-foreground hover:text-foreground"
        onClick={() => {
          setOpen(false);
        }}
      >
        Pricing
      </Link>
      <Link
        to="/login"
        className="text-sm font-medium text-muted-foreground hover:text-foreground"
        onClick={() => {
          setOpen(false);
        }}
      >
        Sign in
      </Link>
    </>
  );
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Logo />
        <nav className="hidden items-center gap-6 md:flex" aria-label="Main navigation">
          {links}
          <Button asChild size="sm">
            <Link
              to="/login"
              onClick={() => {
                setOpen(false);
              }}
            >
              Check my visibility <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </nav>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Toggle navigation"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </Button>
      </div>
      {open && (
        <nav
          className="flex flex-col gap-1 border-t bg-background px-4 py-3 md:hidden"
          aria-label="Main navigation"
        >
          {links}
          <Button asChild size="sm" className="mt-2">
            <Link
              to="/login"
              onClick={() => {
                setOpen(false);
              }}
            >
              Check my visibility <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </nav>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <Logo />
            <p className="mt-2 text-xs text-muted-foreground">
              AI visibility observations from the Perplexity API.
            </p>
          </div>
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2" aria-label="Footer">
            <Link to="/privacy" className="text-sm text-muted-foreground hover:text-foreground">
              Privacy
            </Link>
            <Link to="/terms" className="text-sm text-muted-foreground hover:text-foreground">
              Terms
            </Link>
            <a
              href="mailto:support@cite-scout.com"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Support
            </a>
          </nav>
        </div>
        <Separator className="my-6" />
        <div className="flex flex-col justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
          <span>© {String(new Date().getUTCFullYear())} CiteScout. All rights reserved.</span>
          <span className="text-muted-foreground/60">Built for The Build Games</span>
        </div>
      </div>
    </footer>
  );
}

/* --- Interactive demo dashboard (real components, fixture data) --- */

const demoPromptRows = [
  {
    prompt: 'Best scheduling tool for independent consultants',
    status: 'recommended',
    position: 2,
  },
  { prompt: 'Alternatives to Calendly for freelancers', status: 'mentioned', position: 3 },
  { prompt: 'Simple client booking software', status: 'absent', position: null },
  { prompt: 'Scheduling tools with client intake forms', status: 'recommended', position: 1 },
] as const;

const demoCitations = [
  { source: 'Reddit', icon: RedditIcon, domain: 'reddit.com', count: 34 },
  { source: 'Wikipedia', icon: WikipediaIcon, domain: 'wikipedia.org', count: 21 },
  { source: 'YouTube', icon: YoutubeIcon, domain: 'youtube.com', count: 14 },
  { source: 'X', icon: XIcon, domain: 'x.com', count: 9 },
] as const;

function DemoSparkline() {
  const width = 560;
  const height = 160;
  const values = visibility;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const coords = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - min) / span) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <div>
      <svg
        viewBox={`0 0 ${String(width)} ${String(height)}`}
        className="h-40 w-full"
        role="img"
        aria-label="Example visibility score rising from 42 to 84 over fourteen days"
      >
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            x1="0"
            x2={String(width)}
            y1={String(height * fraction)}
            y2={String(height * fraction)}
            stroke="var(--border)"
            strokeWidth="1"
            strokeDasharray="3,3"
          />
        ))}
        <polygon
          points={`0,${String(height)} ${coords.join(' ')} ${String(width)},${String(height)}`}
          fill="var(--chart-1)"
          opacity="0.07"
        />
        <polyline
          points={coords.join(' ')}
          fill="none"
          stroke="var(--chart-1)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-1.5 flex justify-between text-xs tabular-nums text-muted-foreground">
        <span>{relativeDayLabel(13)}</span>
        <span>{relativeDayLabel(0)}</span>
      </div>
    </div>
  );
}

function DemoDashboard({ compact = false }: { compact?: boolean }) {
  return (
    <Card className="overflow-hidden py-0 shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded bg-primary text-[10px] font-bold italic text-primary-foreground">
            O
          </span>
          <span className="text-sm font-semibold">OrbitCal</span>
        </div>
        <Badge variant="secondary" className="font-normal">
          Last 14 days · UTC
        </Badge>
      </div>

      <Tabs defaultValue="overview">
        <div className="border-b px-4 pt-2">
          <TabsList className="bg-transparent p-0">
            <TabsTrigger
              value="overview"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="prompts"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
            >
              Prompts
            </TabsTrigger>
            <TabsTrigger
              value="citations"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
            >
              Citations
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-0 p-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {(
              [
                ['Visibility score', '84.2', '+8.4'],
                ['Mention rate', '70%', '+20%'],
                ['Share of voice', '31%', '+5%'],
                ['Coverage', '90%', '1 timed out'],
              ] as const
            ).map(([label, value, delta]) => (
              <div key={label} className="rounded-md border p-3">
                <p className="text-[11px] text-muted-foreground">{label}</p>
                <p className="mt-0.5 text-xl font-bold tabular-nums tracking-tight">{value}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  {!delta.includes('timed') && (
                    <TrendingUp className="size-3 text-emerald-600" aria-hidden="true" />
                  )}
                  <span className={delta.includes('timed') ? '' : 'text-emerald-700'}>{delta}</span>
                </p>
              </div>
            ))}
          </div>
          {!compact && (
            <div className="mt-4">
              <DemoSparkline />
            </div>
          )}
        </TabsContent>

        <TabsContent value="prompts" className="mt-0 p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Prompt</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4 text-right">Position</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {demoPromptRows.map((row) => (
                <TableRow key={row.prompt}>
                  <TableCell className="max-w-xs pl-4 text-sm">
                    <span className="line-clamp-1">{row.prompt}</span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge classification={row.status} />
                  </TableCell>
                  <TableCell className="pr-4 text-right text-sm tabular-nums">
                    {row.position === null ? '—' : `#${String(row.position)}`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="citations" className="mt-0 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {demoCitations.map(({ source, icon: Icon, domain, count }) => (
              <div key={source} className="flex items-center gap-3 rounded-md border p-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                  <Icon className="size-4 text-foreground/70" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{source}</p>
                  <p className="truncate text-xs text-muted-foreground">{domain}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                  {String(count)}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Sources most frequently cited in the AI answers CiteScout observed.
          </p>
        </TabsContent>
      </Tabs>
    </Card>
  );
}

/* --- Landing sections --- */

function Hero() {
  return (
    <section className="border-b">
      <div className="mx-auto max-w-6xl px-4 pb-12 pt-16 lg:pb-16 lg:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <Badge variant="secondary" className="mb-4 font-normal text-muted-foreground">
            AI search visibility · Perplexity monitoring
          </Badge>
          <h1 className="font-display text-4xl leading-tight sm:text-5xl lg:text-6xl">
            When founders ask AI for your category,{' '}
            <span className="text-muted-foreground">who gets recommended?</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground lg:text-lg">
            CiteScout tracks how your brand appears in Perplexity answers over time, compares
            competitors, and keeps every source auditable.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link to="/login">
                Check my visibility <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/demo">
                Explore the live demo <ExternalLink className="size-4" />
              </Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            One genuine trial scan. No card required. Monitoring starts at $19/month.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-4xl lg:mt-16">
          <p className="mb-3 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Example dashboard — click through the tabs
          </p>
          <DemoDashboard />
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
    <section className="border-b" aria-labelledby="how-it-works-heading">
      <div className="mx-auto max-w-6xl px-4 py-16 lg:py-20">
        <p
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
          id="how-it-works-heading"
        >
          How CiteScout works
        </p>
        <div className="mt-8 grid gap-8 md:grid-cols-3">
          {steps.map((step) => (
            <div key={step.number} className="border-t pt-4">
              <span className="text-xs font-semibold text-chart-1">{step.number}</span>
              <h3 className="mt-3 text-base font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Integrations() {
  const sources = [
    { label: 'Perplexity answers', icon: PerplexityIcon, note: 'Observed daily' },
    { label: 'Reddit citations', icon: RedditIcon, note: 'Tracked' },
    { label: 'X citations', icon: XIcon, note: 'Tracked' },
    { label: 'YouTube citations', icon: YoutubeIcon, note: 'Tracked' },
    { label: 'Wikipedia citations', icon: WikipediaIcon, note: 'Tracked' },
    { label: 'Google Search', icon: GoogleIcon, note: 'Complements' },
    { label: 'Notion', icon: NotionIcon, note: 'Where teams document' },
  ] as const;

  return (
    <section className="border-b">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
          {sources.map(({ label, icon: Icon, note }) => (
            <div key={label} className="flex items-center gap-2.5" title={note}>
              <Icon className="size-5 text-muted-foreground/50" />
              <span className="text-sm text-muted-foreground/70">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section className="border-b">
      <div className="mx-auto max-w-6xl px-4 py-16 lg:py-20">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          The useful difference
        </p>
        <h2 className="font-display mt-3 max-w-xl text-3xl lg:text-4xl">
          One answer is an anecdote. Fourteen days is a signal.
        </h2>
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          <div className="border-t pt-4">
            <h3 className="text-base font-semibold tracking-tight">Track movement</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              See whether your brand is gaining visibility, losing ground, or appearing
              inconsistently across buyer-style prompts.
            </p>
          </div>
          <div className="border-t pt-4">
            <h3 className="text-base font-semibold tracking-tight">Watch competitors</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Compare share of voice and first-mention order against the products prospects see
              alongside yours.
            </p>
          </div>
          <div className="border-t pt-4">
            <h3 className="text-base font-semibold tracking-tight">Audit the evidence</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Open the stored answer and every returned citation. No mysterious score without the
              underlying observation.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Honesty() {
  return (
    <section className="border-b bg-muted/40">
      <div className="mx-auto max-w-6xl px-4 py-16 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Honest by design
            </p>
            <h2 className="font-display mt-3 text-3xl lg:text-4xl">
              Directional intelligence, not a fabricated ranking.
            </h2>
          </div>
          <div className="flex flex-col justify-center">
            <p className="text-sm leading-relaxed text-muted-foreground lg:text-base">
              AI answers are nondeterministic. CiteScout records observations from the supported
              Perplexity Agent API. It does not claim to reproduce the Perplexity consumer app,
              ChatGPT, Claude, or Google AI Overviews.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function PricingCta() {
  return (
    <section className="border-b">
      <div className="mx-auto max-w-6xl px-4 py-16 lg:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Focused and affordable
            </p>
            <h2 className="font-display mt-3 text-3xl lg:text-4xl">
              Replace the spreadsheet ritual, not your entire SEO stack.
            </h2>
          </div>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold tabular-nums tracking-tight">$19</span>
                <span className="text-sm text-muted-foreground">/ month</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                10 daily prompts · 3 competitors · full history
              </p>
              <Button asChild className="mt-5 w-full">
                <Link to="/pricing">
                  See what is included <ArrowRight className="size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

function Landing() {
  usePageTitle();
  return (
    <>
      <Header />
      <main id="main">
        <Hero />
        <Integrations />
        <HowItWorks />
        <Features />
        <Honesty />
        <PricingCta />
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
      <main id="main" className="mx-auto max-w-6xl px-4 py-12 lg:py-16">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="secondary" className="font-normal text-muted-foreground">
            Illustrative demo data
          </Badge>
          <h1 className="font-display mt-4 text-3xl lg:text-4xl">
            See the pattern, not just the snapshot.
          </h1>
          <p className="mt-3 text-sm text-muted-foreground lg:text-base">
            OrbitCal is a fictional scheduling product. This dashboard demonstrates fourteen days of
            changing AI-search visibility and never calls Perplexity.
          </p>
        </div>
        <div className="mx-auto mt-10 max-w-4xl">
          <DemoDashboard />
        </div>
        <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-muted-foreground">
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
    <section className="mx-auto max-w-3xl px-4 pb-16 lg:pb-20" aria-labelledby="faq-heading">
      <p
        className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        id="faq-heading"
      >
        Frequently asked questions
      </p>
      <div className="mt-6 border-t">
        {pricingFaq.map((item, index) => {
          const isOpen = open === index;
          return (
            <div key={item.question} className="border-b">
              <h3>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-medium hover:text-muted-foreground"
                  onClick={() => {
                    setOpen(isOpen ? null : index);
                  }}
                >
                  {item.question}
                  <ChevronDown
                    className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                  />
                </button>
              </h3>
              {isOpen && (
                <p className="pb-4 text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Pricing() {
  usePageTitle('Pricing');
  return (
    <>
      <Header />
      <main id="main">
        <div className="mx-auto max-w-6xl px-4 pb-12 pt-16 lg:pt-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              One plan. Predictable cost.
            </p>
            <h1 className="font-display mt-3 text-4xl lg:text-5xl">
              Useful monitoring without a sales call.
            </h1>
          </div>

          <Card className="mx-auto mt-10 max-w-2xl">
            <CardContent className="p-6 lg:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">CiteScout Monitor</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    For founders and small teams who need evidence, not another enterprise
                    dashboard.
                  </p>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-bold tabular-nums tracking-tight">$19</span>
                  <span className="text-sm text-muted-foreground">USD / month</span>
                </div>
              </div>
              <Separator className="my-6" />
              <ul className="grid gap-2.5 text-sm sm:grid-cols-2">
                {[
                  'One active project',
                  '10 enabled prompts',
                  '3 tracked competitors',
                  'One observation per prompt per UTC day',
                  'Historical trends and raw answer archive',
                  'Secure self-serve billing',
                  'Cancel anytime, keep your history',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Button asChild size="lg" className="mt-6 w-full">
                <Link to="/login">
                  Start with a trial scan <ArrowRight className="size-4" />
                </Link>
              </Button>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                No card required for the trial scan.
              </p>
            </CardContent>
          </Card>
        </div>
        <Faq />
      </main>
      <Footer />
    </>
  );
}

function Legal({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-2xl px-4 py-12 lg:py-16">
        <p className="text-xs text-muted-foreground">Effective September 16, 2026</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{title}</h1>
        <div className="mt-8 space-y-5 text-sm leading-relaxed text-muted-foreground">
          {children}
        </div>
      </main>
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
        <a
          href="mailto:support@cite-scout.com"
          className="text-foreground underline underline-offset-4"
        >
          support@cite-scout.com
        </a>
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
        Contact:{' '}
        <a
          href="mailto:support@cite-scout.com"
          className="text-foreground underline underline-offset-4"
        >
          support@cite-scout.com
        </a>
      </p>
    </Legal>
  );
}

function MarketingNotFound() {
  usePageTitle('Page not found');
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">404</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Page not found</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          That page does not exist. It may have moved, or the link you followed is out of date.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild>
            <Link to="/">
              Back to home <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/demo">Explore the demo</Link>
          </Button>
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

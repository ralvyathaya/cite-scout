import { ArrowRight, Check, ChevronDown, Menu, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router';
import { Badge } from '@/client/components/ui/badge';
import { Button } from '@/client/components/ui/button';
import { Card, CardContent } from '@/client/components/ui/card';
import { Separator } from '@/client/components/ui/separator';
import { brand } from '@/shared/brand';
import { ErrorBoundary } from '@/client/ErrorBoundary';
import { OfflineBanner } from '@/client/OfflineBanner';
import {
  V2Shell,
  V2Onboarding,
  V2Questions,
  V2QuestionDetail,
  V2Settings,
  LegacyEvidenceRedirect,
} from '@/client/pages/v2/Workspace';
import { Login } from '@/client/pages/Login';
import { usePageTitle } from '@/client/use-page-title';

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
              to="/app/onboarding"
              onClick={() => {
                setOpen(false);
              }}
            >
              Run my baseline <ArrowRight className="size-3.5" />
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
              to="/app/onboarding"
              onClick={() => {
                setOpen(false);
              }}
            >
              Run my baseline <ArrowRight className="size-3.5" />
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
              Buyer questions and saved answers from the Perplexity Agent API.
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

function ExampleEvidence() {
  return (
    <Card className="overflow-hidden border-border/80 py-0 shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-5 py-3">
        <span className="text-sm font-semibold">Example: CedarFlow</span>
        <Badge variant="secondary" className="font-normal">
          Illustrative example
        </Badge>
      </div>
      <CardContent className="space-y-6 p-5 sm:p-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Buyer question
          </p>
          <h2 className="mt-2 text-lg font-semibold tracking-tight">
            Which customer onboarding tools work for a small B2B SaaS team?
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-md border p-4">
            <p className="text-xs font-semibold text-muted-foreground">Baseline · example answer</p>
            <blockquote className="mt-3 text-sm leading-relaxed">
              “Trailkit offers in-app checklists for small teams. Compare its setup requirements
              with your onboarding workflow. [1]”
            </blockquote>
            <p className="mt-4 text-xs">CedarFlow: not matched · Trailkit: matched</p>
          </div>
          <div className="rounded-md border border-primary/30 bg-muted/20 p-4">
            <p className="text-xs font-semibold text-muted-foreground">
              Follow-up · example answer
            </p>
            <blockquote className="mt-3 text-sm leading-relaxed">
              “CedarFlow offers onboarding checklists. Trailkit includes guided product tours.
              Compare both against your setup needs. [1]”
            </blockquote>
            <p className="mt-4 text-xs">CedarFlow: matched · Trailkit: matched</p>
          </div>
        </div>
        <div className="rounded-md bg-muted/50 p-4">
          <p className="text-sm font-semibold">Brand match appeared: CedarFlow</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Open both answers to interpret the difference. A mention does not establish a
            recommendation or explain why the answer changed.
          </p>
        </div>
        <div className="border-t pt-4 text-sm">
          <h3 className="font-semibold">Sources in this example</h3>
          <ul className="mt-3 space-y-2 break-words text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">[1] Cited in answer:</span>{' '}
              onboarding-guide.example/tools
            </li>
            <li>
              <span className="font-medium text-foreground">Returned only:</span>{' '}
              product-notes.example/onboarding
            </li>
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            Returned sources are supplied by the provider. Only a source linked by an identifiable
            answer citation is labeled cited. All vendors, answers and source addresses here are
            fictional.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function PilotOffer() {
  return (
    <div className="space-y-2 text-xs leading-relaxed text-muted-foreground">
      <p>
        Pilot: 3 questions, a baseline and one follow-up check. Then $19/month for up to 10
        questions checked daily.
      </p>
      <p>
        Follow-up is scheduled 72 hours after the baseline phase closes. No card required. Timing
        depends on provider availability and usage limits; details are in settings.
      </p>
      <p>
        The pilot is currently founder-assisted.{' '}
        <a href="mailto:support@cite-scout.com" className="underline underline-offset-4">
          Contact us to join
        </a>
        .
      </p>
    </div>
  );
}

function Hero() {
  return (
    <section className="border-b">
      <div className="mx-auto max-w-6xl px-4 pb-12 pt-16 lg:pb-16 lg:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <Badge variant="secondary" className="mb-4 font-normal text-muted-foreground">
            For SaaS founders already checking Perplexity
          </Badge>
          <h1 className="font-display text-4xl leading-tight sm:text-5xl lg:text-6xl">
            {brand.tagline}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground lg:text-lg">
            {brand.description}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link to="/app/onboarding">
                Run my baseline <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/demo">Explore the example</Link>
            </Button>
          </div>
          <div className="mx-auto mt-5 max-w-xl">
            <PilotOffer />
          </div>
        </div>
        <div className="mx-auto mt-12 max-w-4xl lg:mt-16">
          <ExampleEvidence />
          <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
            Observations from the Perplexity Agent API. Results can differ from the Perplexity app.
          </p>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      number: '01',
      title: 'Bring three buyer questions',
      body: 'Use questions you already check manually. Add your SaaS brand and one to three competitors, then review your baseline setup.',
    },
    {
      number: '02',
      title: 'Inspect the saved answers',
      body: 'Read the observed answer for each question. Inspect matched brand names and distinguish returned sources from sources cited in the answer.',
    },
    {
      number: '03',
      title: 'Return and compare',
      body: 'Compare the follow-up with its baseline. Inspect changes in mentions and sources, then decide what deserves more investigation. No change is a valid result too.',
    },
  ] as const;

  return (
    <section className="border-b" aria-labelledby="how-it-works-heading">
      <div className="mx-auto max-w-6xl px-4 py-16 lg:py-20">
        <h2 className="font-display text-3xl lg:text-4xl" id="how-it-works-heading">
          From a buyer question to evidence you can revisit.
        </h2>
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

function Honesty() {
  return (
    <section className="border-b bg-muted/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 lg:grid-cols-2 lg:py-20">
        <h2 className="font-display text-3xl lg:text-4xl">
          A record for your next marketing review.
        </h2>
        <div className="space-y-3 text-sm leading-relaxed text-muted-foreground lg:text-base">
          <p>
            Each answer is one observation from the Perplexity Agent API using CiteScout’s
            configuration. Answers can vary, even when the question stays the same.
          </p>
          <p>
            Brand mentions and sources help you investigate. They do not measure buyer reach,
            rankings or revenue, and a change does not prove the effect of a marketing action.
          </p>
        </div>
      </div>
    </section>
  );
}

function PricingCta() {
  return (
    <section className="border-b">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 lg:grid-cols-2 lg:py-20">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            One focused pilot
          </p>
          <h2 className="font-display mt-3 text-3xl lg:text-4xl">
            Start with questions you already care about.
          </h2>
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="mb-4 flex items-baseline gap-2">
              <span className="text-4xl font-bold tabular-nums tracking-tight">$19</span>
              <span className="text-sm text-muted-foreground">/ month after the pilot</span>
            </div>
            <PilotOffer />
            <Button asChild className="mt-5 w-full">
              <Link to="/app/onboarding">
                Run my baseline <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Link
              to="/pricing"
              className="mt-3 block text-center text-xs text-muted-foreground underline underline-offset-4"
            >
              View plan details
            </Link>
          </CardContent>
        </Card>
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
        <HowItWorks />
        <Honesty />
        <PricingCta />
      </main>
      <Footer />
    </>
  );
}

function Demo() {
  usePageTitle('Example');
  return (
    <>
      <Header />
      <main id="main" className="mx-auto max-w-6xl px-4 py-12 lg:py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="font-display text-3xl lg:text-4xl">
            Follow one buyer question over time.
          </h1>
          <p className="mt-3 text-sm text-muted-foreground lg:text-base">
            Inspect a fictional baseline and follow-up for CedarFlow, a fictional B2B SaaS. This
            example makes no provider calls and represents no customer results.
          </p>
        </div>
        <div className="mx-auto mt-10 max-w-4xl">
          <ExampleEvidence />
        </div>
        <p className="mx-auto mt-4 max-w-2xl text-center text-xs leading-relaxed text-muted-foreground">
          Observations from the Perplexity Agent API. Results can differ from the Perplexity app.
        </p>
      </main>
      <Footer />
    </>
  );
}

const pricingFaq = [
  {
    question: 'What does CiteScout observe?',
    answer:
      'Answers from the Perplexity Agent API using CiteScout’s configuration. These can differ from the Perplexity app. Each observation is a sample; brand mentions are not rankings or evidence of revenue impact.',
  },
  {
    question: 'What is included in the pilot?',
    answer:
      'Three fixed questions, a baseline, and one follow-up scheduled 72 hours after the baseline phase closes. No card required. The trial expires 14 days after it starts. Provider availability and usage limits can delay checks; failed captures have bounded recovery attempts. Enrollment is founder-assisted.',
  },
  {
    question: 'Can I change my questions and competitors later?',
    answer:
      'The trial question set and brand configuration stay fixed while it runs. You can stop the trial or subscribe to change them. On the paid plan, you can monitor up to ten active questions and three competitors. Replacing a captured question keeps its history and starts a new comparison baseline.',
  },
  {
    question: 'Can I cancel anytime?',
    answer:
      'Yes, from the self-serve billing portal. Daily monitoring continues until the end of your paid period. Saved answers remain available to read and compare after your subscription or trial ends.',
  },
  {
    question: 'Does the price guarantee daily results?',
    answer:
      'The pilot offer is $19/month for one SaaS project and up to ten questions checked daily. Checks depend on provider availability and usage limits. Failed or delayed checks are shown explicitly; they do not count as evidence that your brand was absent.',
  },
  {
    question: 'What if my brand is missing or nothing changes?',
    answer:
      'You can inspect the answer and see which tracked names matched. A follow-up with no detected change is a valid result. You decide whether the evidence suggests anything worth investigating; CiteScout does not promise improved visibility.',
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
                  className="flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-medium transition-colors hover:text-foreground"
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
              One project. One pilot offer.
            </p>
            <h1 className="font-display mt-3 text-4xl lg:text-5xl">
              Keep checking the questions buyers ask.
            </h1>
          </div>

          <Card className="mx-auto mt-10 max-w-2xl">
            <CardContent className="p-6 lg:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">CiteScout Monitor</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    For B2B SaaS founders and first marketers already checking Perplexity manually.
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
                  'Up to 10 active buyer questions',
                  '1–3 tracked competitors',
                  'Daily checks, subject to availability and usage limits',
                  'Saved answers, sources and comparable changes',
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
                <Link to="/app/onboarding">
                  Run my baseline <ArrowRight className="size-4" />
                </Link>
              </Button>
              <div className="mt-4 text-center">
                <PilotOffer />
              </div>
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
              <V2Shell />
            </ErrorBoundary>
          }
        >
          <Route index element={<Navigate to="/app/questions" replace />} />
          <Route path="onboarding" element={<V2Onboarding />} />
          <Route path="questions" element={<V2Questions />} />
          <Route path="questions/:questionId" element={<V2QuestionDetail />} />
          <Route path="overview" element={<Navigate to="/app/questions" replace />} />
          <Route path="prompts" element={<Navigate to="/app/questions" replace />} />
          <Route path="responses" element={<LegacyEvidenceRedirect />} />
          <Route path="billing" element={<Navigate to="/app/settings" replace />} />
          <Route path="settings" element={<V2Settings />} />
        </Route>
        <Route path="*" element={<MarketingNotFound />} />
      </Routes>
    </>
  );
}

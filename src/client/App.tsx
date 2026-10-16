import { ArrowRight, Check, ChevronDown, FileText, ListChecks, Menu, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Route, Routes } from 'react-router';
import { Badge } from '@/client/components/ui/badge';
import { Button } from '@/client/components/ui/button';
import { Card, CardContent } from '@/client/components/ui/card';
import { Separator } from '@/client/components/ui/separator';
import { brand } from '@/shared/brand';
import { BrandLogo } from '@/client/components/BrandLogo';
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
import { V2Overview } from '@/client/pages/v2/Overview';
import {
  GeoObservations,
  GeoObservationDetail,
  GeoDiagnoses,
  GeoPlaybook,
  GeoActionPage,
  GeoSources,
  GeoCompetitors,
  GeoBilling,
} from '@/client/pages/v2/GeoWorkspace';
import { Login } from '@/client/pages/Login';
import { usePageTitle } from '@/client/use-page-title';

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2" aria-label={`${brand.name} home`}>
      <BrandLogo />
    </Link>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  const links = (
    <>
      {(
        [
          ['/demo', 'Demo'],
          ['/pricing', 'Pricing'],
          ['/login', 'Sign in'],
        ] as const
      ).map(([to, label]) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `rounded-md px-2 py-2 text-sm font-medium ${isActive ? 'bg-accent text-primary' : 'text-muted-foreground hover:text-foreground'}`
          }
          onClick={() => {
            setOpen(false);
          }}
        >
          {label}
        </NavLink>
      ))}
    </>
  );
  return (
    <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-4 md:flex" aria-label="Main navigation">
          {links}
          <Button asChild size="sm">
            <Link
              to="/demo"
              onClick={() => {
                setOpen(false);
              }}
            >
              Explore preview <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </nav>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Toggle navigation"
          aria-expanded={open}
          aria-controls="mobile-public-navigation"
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </Button>
      </div>
      {open && (
        <nav
          id="mobile-public-navigation"
          className="flex flex-col gap-1 border-t bg-card px-4 py-3 md:hidden"
          aria-label="Main navigation"
        >
          {links}
          <Button asChild size="sm" className="mt-2">
            <Link
              to="/demo"
              onClick={() => {
                setOpen(false);
              }}
            >
              Explore preview <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </nav>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t bg-card">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <div>
            <Logo />
            <p className="mt-2 text-xs text-muted-foreground">
              Buyer questions. Evidence. Your next action.
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
        </div>
      </div>
    </footer>
  );
}

function ExampleEvidence() {
  return (
    <Card className="min-w-0 gap-0 overflow-hidden py-0 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-5 py-3">
        <span className="text-sm font-semibold">Example: CedarFlow</span>
        <Badge variant="secondary" className="font-normal">
          Synthetic example
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
            <time
              dateTime="2026-10-01T12:00:00Z"
              className="mt-1 block text-xs text-muted-foreground"
            >
              1 Oct 2026 · 12:00 UTC · Perplexity (illustrative)
            </time>
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
            <time
              dateTime="2026-10-08T12:00:00Z"
              className="mt-1 block text-xs text-muted-foreground"
            >
              8 Oct 2026 · 12:00 UTC · Perplexity (illustrative)
            </time>
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
            Read both answers to interpret the difference. A mention does not establish a
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
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:gap-14 lg:py-20">
        <div className="min-w-0">
          <Badge variant="outline" className="mb-5 bg-card text-primary">
            GEO workspace · Preview
          </Badge>
          <h1 className="font-display text-4xl leading-[1.15] sm:text-5xl">{brand.tagline}</h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
            {brand.description}
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link to="/demo">
                Explore GEO preview <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/pricing">View Perplexity plan</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            GEO is in owner preview. The demo is synthetic and makes no provider calls.
          </p>
        </div>
        <Card
          className="min-w-0 gap-0 overflow-hidden py-0 shadow-sm"
          aria-label="GEO workflow example"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
            <span className="text-sm font-semibold">CedarFlow workspace</span>
            <Badge variant="secondary">Synthetic example</Badge>
          </div>
          <CardContent className="space-y-5 p-5 sm:p-6">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Prompt set · Buyer comparisons
              </p>
              <p className="mt-2 text-base font-semibold leading-relaxed">
                Which customer onboarding tools work for a small B2B SaaS team?
              </p>
            </div>
            <div className="rounded-lg border bg-background p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileText className="size-4 text-primary" aria-hidden="true" /> Saved answer &
                sources
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                “Trailkit offers in-app checklists for small teams. [1]”
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                1 Oct 2026 · 12:00 UTC · Illustrative Perplexity answer
              </p>
            </div>
            <div className="border-l-2 border-primary pl-4">
              <p className="text-sm font-semibold">Review an evidence gap</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                CedarFlow is absent from this answer. Check whether its published onboarding claims
                have supporting evidence.
              </p>
            </div>
            <div className="flex items-start gap-3 rounded-lg bg-accent p-4">
              <ListChecks className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold">Next task · Web / Owned</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Review the onboarding comparison page, then record the change before measuring
                  again.
                </p>
              </div>
            </div>
            <Link
              to="/demo"
              className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Inspect the example <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      number: '01',
      title: 'Set your prompts',
      body: 'Group the questions buyers ask when comparing options. Keep the wording and context available for every observation.',
    },
    {
      number: '02',
      title: 'Inspect the evidence',
      body: 'Read the original answer, engine and timestamp. Distinguish a citation in the answer from a source returned by the provider.',
    },
    {
      number: '03',
      title: 'Review the diagnosis',
      body: 'Assess suggested retrieval, evidence or recommendation-fit problems against the saved answer. Treat each diagnosis as a hypothesis.',
    },
    {
      number: '04',
      title: 'Work the playbook',
      body: 'Choose an Owned or Earned Media task. Use its checklist and brief, make the change in your own tools, and record what you did.',
    },
    {
      number: '05',
      title: 'Measure again',
      body: 'Compare eligible observations with matching context. Action pins show when work was completed; a change alone does not establish its cause.',
    },
  ] as const;

  return (
    <section className="border-b bg-card" aria-labelledby="how-it-works-heading">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          The GEO loop · In preview
        </p>
        <h2 className="font-display mt-3 max-w-2xl text-3xl" id="how-it-works-heading">
          A workflow that continues after the answer.
        </h2>
        <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((step) => (
            <li key={step.number} className="border-t pt-4">
              <span className="text-xs font-semibold text-chart-1">{step.number}</span>
              <h3 className="mt-3 text-base font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Honesty() {
  return (
    <section className="border-b">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:gap-14">
        <h2 className="font-display max-w-md text-3xl">Keep the evidence close to the decision.</h2>
        <div className="space-y-3 text-sm leading-relaxed text-muted-foreground lg:text-base">
          <p>
            Every observation belongs to a prompt, engine, time and collection method. Answers can
            vary even when the question stays the same. API answers can differ from consumer chat
            products.
          </p>
          <p>
            Suggested diagnoses need review. Brand mentions and citations help you investigate; they
            do not establish buyer reach, rankings or revenue. An action pin records timing, not
            proof that the action caused a change.
          </p>
        </div>
      </div>
    </section>
  );
}

function PricingCta() {
  return (
    <section className="border-b">
      <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-14 sm:px-6 lg:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Available separately · Legacy Perplexity plan
          </p>
          <h2 className="font-display mt-3 text-3xl lg:text-4xl">
            Need a record of your Perplexity checks?
          </h2>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">
            The existing Perplexity monitoring plan keeps your buyer questions, saved answers and
            comparisons together. GEO preview is separate from the $19 plan.
          </p>
        </div>
        <Card>
          <CardContent className="px-6">
            <h3 className="mb-3 text-lg font-semibold">Perplexity monitoring</h3>
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
      <main id="main" className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6 lg:py-14">
        <div className="max-w-3xl">
          <Badge variant="outline" className="mb-4 bg-card text-primary">
            GEO preview · Illustrative workflow
          </Badge>
          <h1 className="font-display text-3xl leading-tight sm:text-4xl">
            Follow the evidence. Decide what to do next.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Follow a fictional buyer question for CedarFlow through the GEO loop. Every answer,
            diagnosis, task and date here is synthetic. This example makes no provider calls and
            represents no customer results.
          </p>
        </div>
        <nav aria-label="Example workflow" className="flex flex-wrap gap-2 text-sm">
          {(
            [
              ['example-evidence', '1. Prompt & answers'],
              ['example-diagnosis', '2. Diagnosis'],
              ['example-tasks', '3. Action playbook'],
              ['example-comparison', '4. Re-measurement'],
            ] as const
          ).map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="rounded-md border bg-card px-3 py-2 text-muted-foreground hover:border-primary hover:text-primary"
            >
              {label}
            </a>
          ))}
        </nav>
        <section
          id="example-evidence"
          className="scroll-mt-24"
          aria-label="Prompt and original answers"
        >
          <ExampleEvidence />
        </section>
        <section
          id="example-diagnosis"
          className="scroll-mt-24 rounded-xl border bg-card p-5 shadow-sm sm:p-6"
          aria-labelledby="example-diagnosis-heading"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="example-diagnosis-heading" className="text-xl font-semibold tracking-tight">
              Review the diagnosis
            </h2>
            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
              Needs review
            </Badge>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Hypothesis · Evidence problem
              </p>
              <p className="mt-2 text-sm leading-relaxed">
                The baseline cites a comparison guide and omits CedarFlow. Its publicly available
                onboarding claims may need clearer supporting evidence.
              </p>
            </div>
            <div className="rounded-lg bg-background p-4 text-sm leading-relaxed text-muted-foreground">
              <p className="font-medium text-foreground">What this answer establishes</p>
              <p className="mt-1">
                CedarFlow was absent from one illustrative answer. That absence alone does not prove
                a retrieval problem, a content gap or the reason for the omission.
              </p>
            </div>
          </div>
        </section>
        <section
          id="example-tasks"
          className="scroll-mt-24 space-y-4"
          aria-labelledby="example-tasks-heading"
        >
          <div>
            <h2 id="example-tasks-heading" className="text-xl font-semibold tracking-tight">
              Choose a concrete task
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Review the brief, make changes in your own tools, then add a note with the URL and
              completion time.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0 rounded-xl border bg-card p-5 shadow-sm">
              <Badge variant="outline" className="text-primary">
                Web / Owned
              </Badge>
              <h3 className="mt-3 text-base font-semibold">Support the onboarding comparison</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Brief: help small SaaS teams verify CedarFlow’s setup requirements and supported use
                cases.
              </p>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
                <li>Review the comparison page against the buyer’s question.</li>
                <li>Add verifiable product details and links to supporting documentation.</li>
                <li>Record the changed URL and what was published.</li>
              </ul>
            </div>
            <div className="min-w-0 rounded-xl border bg-card p-5 shadow-sm">
              <Badge variant="secondary">Earned Media</Badge>
              <h3 className="mt-3 text-base font-semibold">Review the cited comparison guide</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Brief: check the third-party source cited in the baseline for relevant omissions or
                outdated facts.
              </p>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
                <li>Read the guide and verify its relevance to this prompt.</li>
                <li>Offer a factual correction through its stated process, if appropriate.</li>
                <li>
                  Disclose your affiliation and record any response. Inclusion is not guaranteed.
                </li>
              </ul>
            </div>
          </div>
        </section>
        <section
          id="example-comparison"
          className="scroll-mt-24 rounded-xl border bg-card p-5 shadow-sm sm:p-6"
          aria-labelledby="example-comparison-heading"
        >
          <h2 id="example-comparison-heading" className="text-xl font-semibold tracking-tight">
            Measure again with context
          </h2>
          <ol className="mt-5 grid gap-5 border-l-2 border-primary/25 pl-5 text-sm sm:grid-cols-3 sm:border-l-0 sm:border-t-2 sm:pl-0 sm:pt-5">
            <li>
              <p className="font-semibold">1 Oct · Baseline</p>
              <p className="mt-2 leading-relaxed text-muted-foreground">
                Brand absent from the illustrative answer. Prompt and collection context saved.
              </p>
            </li>
            <li>
              <p className="font-semibold text-primary">5 Oct · Action pin</p>
              <p className="mt-2 leading-relaxed text-muted-foreground">
                Owned task completed. Note: “Published setup details and FAQ on the comparison
                page.”
              </p>
            </li>
            <li>
              <p className="font-semibold">8 Oct · Follow-up</p>
              <p className="mt-2 leading-relaxed text-muted-foreground">
                A brand match appears. Inspect both answers and the saved action before interpreting
                it.
              </p>
            </li>
          </ol>
          <p className="mt-5 rounded-lg bg-background p-4 text-sm leading-relaxed text-muted-foreground">
            Two synthetic samples illustrate the workflow. They do not prove an action’s effect or
            financial ROI. A real follow-up can show no change, and incompatible collection contexts
            cannot be combined.
          </p>
        </section>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-accent p-5">
          <p className="max-w-xl text-sm leading-relaxed">
            GEO is in owner preview. The existing $19 subscription covers Perplexity monitoring; it
            does not include this multi-engine action loop.
          </p>
          <Button asChild variant="outline">
            <Link to="/pricing">
              View plan details <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </main>
      <Footer />
    </>
  );
}

const pricingFaq = [
  {
    question: 'Is GEO preview included in the $19 plan?',
    answer:
      'No. GEO is in owner preview while capture completeness and diagnosis quality are evaluated. The public demo is synthetic. Multi-engine monitoring, diagnoses and action playbooks are not promised as part of the existing Perplexity subscription. GEO pricing and pilot access are not yet announced.',
  },
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
    <section
      className="mx-auto max-w-3xl px-4 pb-14 sm:px-6 lg:pb-16"
      aria-labelledby="faq-heading"
    >
      <h2 className="text-xl font-semibold tracking-tight" id="faq-heading">
        Frequently asked questions
      </h2>
      <div className="mt-6 border-t">
        {pricingFaq.map((item, index) => {
          const isOpen = open === index;
          return (
            <div key={item.question} className="border-b">
              <h3>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`pricing-answer-${String(index)}`}
                  className="flex w-full items-center justify-between gap-4 rounded-sm py-4 text-left text-sm font-medium transition-colors hover:text-primary"
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
              <p
                id={`pricing-answer-${String(index)}`}
                hidden={!isOpen}
                className="pb-4 text-sm leading-relaxed text-muted-foreground"
              >
                {item.answer}
              </p>
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
        <div className="mx-auto max-w-6xl px-4 pb-12 pt-12 sm:px-6 lg:pt-16">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Perplexity monitoring & GEO preview
            </p>
            <h1 className="font-display mt-3 text-4xl lg:text-5xl">
              Keep checking the questions buyers ask.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Choose the existing Perplexity plan for saved answers and comparisons. Explore the GEO
              workflow separately in the illustrative demo.
            </p>
          </div>

          <div className="mx-auto mt-10 grid max-w-5xl items-start gap-5 lg:grid-cols-[1.25fr_1fr]">
            <Card className="min-w-0 gap-0 shadow-sm">
              <CardContent className="px-5 sm:px-6">
                <Badge variant="secondary" className="mb-4">
                  Existing plan · Perplexity only
                </Badge>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight">Perplexity monitoring</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      For B2B SaaS founders and first marketers already checking Perplexity
                      manually.
                    </p>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-4xl font-bold tabular-nums tracking-tight">$19</span>
                    <span className="text-sm text-muted-foreground">USD / month</span>
                  </div>
                </div>
                <Separator className="my-6" />
                <ul className="grid gap-2.5 text-sm">
                  {[
                    'One active project',
                    'Up to 10 active buyer questions',
                    '1–3 tracked competitors',
                    'Answers from the Perplexity Agent API',
                    'Daily checks, subject to availability and usage limits',
                    'Saved answers, sources and comparable changes',
                    'Secure self-serve billing',
                    'Cancel anytime, keep your history',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <Check
                        className="mt-0.5 size-4 shrink-0 text-emerald-600"
                        aria-hidden="true"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
                  Results can differ from the Perplexity app. Other engines, GEO diagnoses and
                  action playbooks are separate from this subscription.
                </p>
                <Button asChild size="lg" className="mt-6 w-full">
                  <Link to="/app/onboarding">
                    Run my baseline <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <div className="mt-4 border-t pt-4">
                  <PilotOffer />
                </div>
              </CardContent>
            </Card>
            <Card className="min-w-0 gap-0 border-primary/25 shadow-sm">
              <CardContent className="px-5 sm:px-6">
                <Badge variant="outline" className="mb-4 text-primary">
                  Owner preview
                </Badge>
                <h2 className="text-xl font-semibold tracking-tight">GEO preview</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Prompt sets, original answer evidence, suggested diagnoses, Owned/Earned tasks and
                  re-measurement with action pins.
                </p>
                <p className="mt-5 font-medium">GEO preview is separate from the $19 plan.</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Pricing and founder pilot access are not yet announced. Engine completeness and
                  diagnosis quality are still being evaluated.
                </p>
                <Button asChild variant="outline" className="mt-6 w-full">
                  <Link to="/demo">
                    Explore GEO preview <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  The demo uses synthetic examples. It does not create a project, start monitoring
                  or grant preview access.
                </p>
              </CardContent>
            </Card>
          </div>
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
      <main id="main" className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
        <Link to="/" className="text-sm text-primary underline-offset-4 hover:underline">
          CiteScout home
        </Link>
        <div className="mt-6 rounded-xl border bg-card p-5 shadow-sm sm:p-8">
          <p className="text-xs text-muted-foreground">Effective September 16, 2026</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">{title}</h1>
          <div className="mt-6 space-y-5 break-words border-t pt-6 text-sm leading-relaxed text-muted-foreground">
            {children}
          </div>
        </div>
        <nav
          aria-label="Legal pages"
          className="mt-6 flex flex-wrap gap-4 text-sm text-muted-foreground"
        >
          <Link to="/privacy" className="underline underline-offset-4">
            Privacy policy
          </Link>
          <Link to="/terms" className="underline underline-offset-4">
            Terms of service
          </Link>
        </nav>
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
      <main id="main" className="mx-auto max-w-xl px-4 py-14 sm:px-6 lg:py-20">
        <div className="rounded-xl border bg-card p-5 text-center shadow-sm sm:p-8">
          <p className="text-sm font-semibold tracking-wider text-primary">404</p>
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
          <Route index element={<Navigate to="/app/overview" replace />} />
          <Route path="onboarding" element={<V2Onboarding />} />
          <Route path="questions" element={<V2Questions />} />
          <Route path="questions/:questionId" element={<V2QuestionDetail />} />
          <Route path="overview" element={<V2Overview />} />
          <Route path="observations" element={<GeoObservations />} />
          <Route path="observations/:observationId" element={<GeoObservationDetail />} />
          <Route path="diagnoses" element={<GeoDiagnoses />} />
          <Route path="playbook" element={<GeoPlaybook />} />
          <Route path="playbook/:actionId" element={<GeoActionPage />} />
          <Route path="sources" element={<GeoSources />} />
          <Route path="competitors" element={<GeoCompetitors />} />
          <Route path="prompts" element={<Navigate to="/app/questions" replace />} />
          <Route path="responses" element={<LegacyEvidenceRedirect />} />
          <Route path="billing" element={<GeoBilling />} />
          <Route path="settings" element={<V2Settings />} />
        </Route>
        <Route path="*" element={<MarketingNotFound />} />
      </Routes>
    </>
  );
}

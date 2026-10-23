import { useState } from 'react';
import { Link } from 'react-router';
import { Check } from 'lucide-react';
import { publicPlans, type BillingInterval, type BillingSelection } from '@/shared/plans';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import type { PlanBillingStatus } from '@/client/lib/billing-selection';

export function PricingPlans({
  initialInterval = 'month',
  billing,
  busy = false,
  onCheckout,
}: {
  initialInterval?: BillingInterval;
  billing?: PlanBillingStatus;
  busy?: boolean;
  onCheckout?: (selection: BillingSelection) => void;
}) {
  const [interval, setInterval] = useState(initialInterval);
  return (
    <section aria-label="Monitoring plans" className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <div
          role="group"
          aria-label="Billing interval"
          className="inline-flex rounded-lg border bg-card p-1"
        >
          {(['month', 'year'] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={interval === value ? 'secondary' : 'ghost'}
              aria-pressed={interval === value}
              onClick={() => {
                setInterval(value);
              }}
            >
              {value === 'month' ? 'Monthly' : 'Annual'}
            </Button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">Annual saves 16.7% · two months free</span>
      </div>
      <div className="grid items-stretch gap-4 md:grid-cols-3">
        {publicPlans.map((plan) => {
          const available =
            billing?.plansEnabled === true &&
            billing.checkoutOptions?.some(
              (option) =>
                option.planId === plan.id && option.interval === interval && option.available,
            );
          return (
            <article
              key={plan.id}
              aria-label={`${plan.name} plan`}
              className="flex min-w-0 flex-col rounded-xl border bg-card p-5 shadow-sm sm:p-6"
            >
              <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-semibold">{plan.name}</h2>
                {plan.id === 'growth' && <Badge variant="secondary">Recommended</Badge>}
              </div>
              <p className="mt-5 flex flex-wrap items-baseline gap-1.5">
                <strong className="text-4xl font-semibold tabular-nums">
                  $
                  {interval === 'year'
                    ? plan.annualPriceUsd.toLocaleString('en-US')
                    : plan.monthlyPriceUsd}
                </strong>
                <span className="text-sm text-muted-foreground">
                  USD / {interval === 'year' ? 'year' : 'month'}
                </span>
              </p>
              <p className="mt-2 min-h-10 text-sm text-muted-foreground">
                {interval === 'year'
                  ? `Billed $${plan.annualPriceUsd.toLocaleString('en-US')} annually · equivalent to $${(plan.annualPriceUsd / 12).toFixed(2)}/month`
                  : 'Billed monthly. Cancel renewal anytime.'}
              </p>
              <ul className="my-5 space-y-3 border-t pt-5 text-sm">
                {[
                  `${String(plan.promptLimit)} active buyer prompts`,
                  `${String(plan.dailyChecks)} checks per day`,
                  '3 AI search engines',
                  'One brand workspace',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    />
                    {item}
                  </li>
                ))}
              </ul>
              {onCheckout ? (
                <Button
                  className="mt-auto w-full"
                  variant={plan.id === 'growth' ? 'default' : 'outline'}
                  disabled={busy || !available}
                  onClick={() => {
                    onCheckout({ planId: plan.id, interval });
                  }}
                >
                  {busy ? 'Opening checkout…' : `Choose ${plan.name}`}
                </Button>
              ) : (
                <Button
                  asChild
                  className="mt-auto w-full"
                  variant={plan.id === 'growth' ? 'default' : 'outline'}
                >
                  <Link to={`/app/onboarding?planId=${plan.id}&interval=${interval}`}>
                    Set up {plan.name}
                  </Link>
                </Button>
              )}
            </article>
          );
        })}
      </div>
      <div className="space-y-2 text-center text-sm text-muted-foreground">
        <p>
          Every plan includes Answers, Sources, Competitors, Diagnoses, Action Playbook and
          comparable follow-up measurements.
        </p>
        <p>Perplexity · OpenAI Web Search API · Google AI Overviews</p>
        <p className="text-xs">
          One check = one prompt on one engine. Manual and scheduled checks share the daily
          allowance; no rollover. Prices exclude applicable taxes.
        </p>
        {!billing?.plansEnabled && (
          <p role="status" className="text-xs">
            New plans are being prepared. Setup does not purchase a subscription or start
            monitoring.
          </p>
        )}
      </div>
    </section>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/client/components/ui/alert-dialog';
import { Badge } from '@/client/components/ui/badge';
import { Button } from '@/client/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/client/components/ui/card';
import { Input } from '@/client/components/ui/input';
import { Label } from '@/client/components/ui/label';
import { Separator } from '@/client/components/ui/separator';
import { Skeleton } from '@/client/components/ui/skeleton';
import { usePageTitle } from '@/client/use-page-title';
import { PageState } from './AppShell';
import { useDashboardContext } from './dashboard-context';
import { fmtPercent } from './dashboard-view';

interface BillingStatus {
  subscription: {
    status: string;
    cancelled: boolean;
    endsAt: string | null;
    renewsAt: string | null;
    testMode: boolean;
    cardBrand: string | null;
    cardLastFour: string | null;
  } | null;
  entitlement: {
    canScan: boolean;
    hasPaidFeatures: boolean;
    warning: 'payment' | 'paused' | 'expired' | null;
  };
}

type BillingLoad =
  { status: 'loading' } | { status: 'ready'; data: BillingStatus } | { status: 'error' };

function formatScheduleDate(...candidates: (string | null)[]): string {
  const found = candidates.find(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  return found === undefined ? 'Not scheduled' : found.slice(0, 10);
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${String(count)} ${count === 1 ? singular : plural}`;
}

function SubscriptionSummary({ load }: { load: BillingLoad }) {
  if (load.status === 'loading')
    return <p className="text-sm text-muted-foreground">Loading billing details…</p>;

  if (load.status === 'error')
    return (
      <p role="alert" className="text-sm text-destructive">
        Could not load your billing status. Check your connection — this does not affect your
        subscription.
      </p>
    );

  const subscription = load.data.subscription;
  if (!subscription)
    return (
      <p className="text-sm text-muted-foreground">
        No subscription is linked to this account. The free trial scan can be used once; daily
        monitoring starts after a verified payment.
      </p>
    );

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
      <div>
        <dt className="text-xs text-muted-foreground">Status</dt>
        <dd className="mt-0.5 text-sm font-medium capitalize">
          {subscription.status.replace('_', ' ')}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Mode</dt>
        <dd className="mt-0.5 text-sm font-medium">
          {subscription.testMode ? 'Test mode (no real charges)' : 'Live'}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">
          {subscription.endsAt ? 'Access ends' : 'Renews'}
        </dt>
        <dd className="mt-0.5 text-sm font-medium tabular-nums">
          {formatScheduleDate(subscription.endsAt, subscription.renewsAt)}
        </dd>
      </div>
      {subscription.cardLastFour && (
        <div>
          <dt className="text-xs text-muted-foreground">Payment method</dt>
          <dd className="mt-0.5 text-sm font-medium tabular-nums">
            {subscription.cardBrand ?? 'Card'} ···· {subscription.cardLastFour}
          </dd>
        </div>
      )}
    </dl>
  );
}

/**
 * Checkout success is a UX signal only. Access is granted exclusively by a
 * verified webhook, so this polls our own billing state.
 */
function ConfirmingSubscription({ onVerified }: { onVerified: () => void }) {
  const [attempts, setAttempts] = useState(0);
  const [manual, setManual] = useState(0);
  const settled = useRef(false);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      for (let index = 0; index < 6; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (controller.signal.aborted) return;
        setAttempts(index + 1);

        let response: Response;
        try {
          response = await fetch('/api/billing/status', { signal: controller.signal });
        } catch {
          return;
        }
        if (!response.ok) continue;

        const body = (await response.json()) as { data: BillingStatus };
        const subscription = body.data.subscription;
        if (subscription !== null && subscription.status !== 'expired') {
          if (!settled.current) {
            settled.current = true;
            onVerified();
          }
          return;
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [manual, onVerified]);

  return (
    <div
      className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-4 py-3 text-sm"
      role="status"
      aria-live="polite"
    >
      <strong className="font-semibold">Confirming your subscription…</strong>
      <span className="text-muted-foreground">
        Activation happens only after payment is verified. Checked {pluralize(attempts, 'time')}.
      </span>
      <Button
        variant="outline"
        size="sm"
        className="ml-auto"
        onClick={() => {
          setAttempts(0);
          setManual((value) => value + 1);
        }}
      >
        Check again
      </Button>
    </div>
  );
}

export function BillingPage() {
  const dashboard = useDashboardContext();
  usePageTitle('Billing');
  const [params, setParams] = useSearchParams();
  const [load, setLoad] = useState<BillingLoad>({ status: 'loading' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/billing/status', { signal: controller.signal });
        if (!response.ok) {
          if (!controller.signal.aborted) setLoad({ status: 'error' });
          return;
        }
        const body = (await response.json()) as { data: BillingStatus };
        if (!controller.signal.aborted) setLoad({ status: 'ready', data: body.data });
      } catch {
        if (!controller.signal.aborted) setLoad({ status: 'error' });
      }
    })();
    return () => {
      controller.abort();
    };
  }, []);

  async function refreshStatus() {
    setLoad({ status: 'loading' });
    try {
      const response = await fetch('/api/billing/status');
      if (!response.ok) {
        setLoad({ status: 'error' });
        return;
      }
      const body = (await response.json()) as { data: BillingStatus };
      setLoad({ status: 'ready', data: body.data });
    } catch {
      setLoad({ status: 'error' });
    }
  }

  if (dashboard.state.status === 'loading') {
    return (
      <div className="p-6 lg:p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-4 h-64 max-w-2xl" />
      </div>
    );
  }

  if (dashboard.state.status === 'unauthenticated' || dashboard.state.status === 'error') {
    return <PageState state={dashboard.state} onRetry={dashboard.reload} />;
  }

  const checkoutComplete = params.get('checkout') === 'complete';
  const hasSubscription = load.status === 'ready' && load.data.subscription !== null;

  return (
    <div className="p-6 lg:p-8">
      <div id="main" className="sr-only">
        Billing
      </div>
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">Plan and payment</p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight">Billing</h1>
      </div>

      {checkoutComplete && (
        <ConfirmingSubscription
          onVerified={() => {
            void refreshStatus();
            dashboard.reload();
            params.delete('checkout');
            setParams(params, { replace: true });
          }}
        />
      )}

      <Card className="max-w-2xl">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">CiteScout Monitor</CardTitle>
            <Badge variant="secondary" className="tabular-nums">
              $19 USD / month
            </Badge>
          </div>
          <CardDescription>
            For founders and small teams who need evidence, not another enterprise dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <SubscriptionSummary load={load} />

          <Separator />

          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            <li className="flex items-center gap-2">
              <span className="size-1 rounded-full bg-foreground" aria-hidden="true" />
              One active project
            </li>
            <li className="flex items-center gap-2">
              <span className="size-1 rounded-full bg-foreground" aria-hidden="true" />
              10 enabled prompts
            </li>
            <li className="flex items-center gap-2">
              <span className="size-1 rounded-full bg-foreground" aria-hidden="true" />3 tracked
              competitors
            </li>
            <li className="flex items-center gap-2">
              <span className="size-1 rounded-full bg-foreground" aria-hidden="true" />
              One observation per prompt per UTC day
            </li>
            <li className="flex items-center gap-2">
              <span className="size-1 rounded-full bg-foreground" aria-hidden="true" />
              Historical trends and raw answer archive
            </li>
            <li className="flex items-center gap-2">
              <span className="size-1 rounded-full bg-foreground" aria-hidden="true" />
              Cancel anytime, keep your history
            </li>
          </ul>

          <div className="flex flex-wrap items-center gap-3">
            {hasSubscription ? (
              <Button
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void fetch('/api/billing/portal', { method: 'POST' })
                    .then(async (response) => {
                      const body = (await response.json()) as {
                        data?: { url: string };
                        error?: { message: string };
                      };
                      if (response.ok && body.data) window.location.assign(body.data.url);
                      else toast.error(body.error?.message ?? 'Could not open the billing portal.');
                    })
                    .catch(() => {
                      toast.error('Network error while opening the billing portal.');
                    })
                    .finally(() => {
                      setBusy(false);
                    });
                }}
              >
                {busy ? 'Opening…' : 'Manage billing'}
              </Button>
            ) : (
              <Button
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void fetch('/api/billing/checkout', { method: 'POST' })
                    .then(async (response) => {
                      const body = (await response.json()) as {
                        data?: { url: string };
                        error?: { message: string };
                      };
                      if (response.ok && body.data) window.location.assign(body.data.url);
                      else toast.error(body.error?.message ?? 'Could not start checkout.');
                    })
                    .catch(() => {
                      toast.error('Network error while starting checkout.');
                    })
                    .finally(() => {
                      setBusy(false);
                    });
                }}
              >
                {busy ? 'Opening checkout…' : 'Open secure checkout'}
              </Button>
            )}
            <Link
              to="/app/overview"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Back to overview
            </Link>
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            Checkout and the customer portal are hosted by Lemon Squeezy, the merchant of record.
            CiteScout never stores card data. Returning from checkout does not by itself grant
            access.
          </p>
        </CardContent>
      </Card>

      {load.status === 'ready' && load.data.entitlement.warning && (
        <p role="alert" className="mt-4 max-w-2xl text-sm text-destructive">
          Your subscription is {load.data.entitlement.warning}. New provider calls are paused;
          historical data remains available.
        </p>
      )}

      {dashboard.state.status === 'ready' && dashboard.state.data.totalObservations > 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          Stored observations retained on this account:{' '}
          {String(dashboard.state.data.totalObservations)}. Recent coverage:{' '}
          {fmtPercent(dashboard.state.data.current.coverage)}.
        </p>
      )}
    </div>
  );
}

export function SettingsPage() {
  const dashboard = useDashboardContext();
  usePageTitle('Settings');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');

  if (dashboard.state.status === 'loading') {
    return (
      <div className="p-6 lg:p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-4 h-64 max-w-2xl" />
      </div>
    );
  }

  if (dashboard.state.status === 'unauthenticated' || dashboard.state.status === 'error') {
    return <PageState state={dashboard.state} onRetry={dashboard.reload} />;
  }

  const data = dashboard.state.status === 'ready' ? dashboard.state.data : null;

  async function deleteAccount() {
    setBusy(true);
    try {
      const response = await fetch('/api/account', { method: 'DELETE' });
      const body = (await response.json()) as {
        data?: { deleted: boolean };
        error?: { message: string };
      };
      if (response.ok) {
        window.location.assign('/');
        return;
      }
      toast.error(body.error?.message ?? 'Account deletion failed.');
    } catch {
      toast.error('Network error while deleting the account.');
    } finally {
      setBusy(false);
      setConfirming(false);
      setTyped('');
    }
  }

  return (
    <div className="p-6 lg:p-8">
      <div id="main" className="sr-only">
        Project settings
      </div>
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">Workspace</p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight">Project settings</h1>
      </div>

      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tracked identity</CardTitle>
          </CardHeader>
          <CardContent>
            {data ? (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted-foreground">Brand</dt>
                  <dd className="mt-0.5 truncate text-sm font-medium">{data.brandName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Canonical domain</dt>
                  <dd className="mt-0.5 truncate text-sm font-medium">{data.canonicalDomain}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Competitors</dt>
                  <dd className="mt-0.5 truncate text-sm font-medium">
                    {data.shareOfVoiceByEntity
                      .filter((entity) => entity.key !== 'brand')
                      .map((entity) => entity.label)
                      .join(', ') || 'None'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Provider</dt>
                  <dd className="mt-0.5 truncate text-sm font-medium">
                    {data.provider
                      ? `${data.provider.name} · ${data.provider.model ?? 'unknown model'}`
                      : 'No calls yet'}
                  </dd>
                </div>
              </dl>
            ) : (
              <div>
                <p className="text-sm text-muted-foreground">
                  No brand has been configured yet. Set up your brand identity to begin monitoring.
                </p>
                <Button asChild size="sm" className="mt-4">
                  <Link to="/app/onboarding">Start project setup (2 min) →</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Provider usage</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Stored observations: {data ? String(data.totalObservations) : '0'}. Cost controls are
              enforced server-side, including a global daily cap, a per-user monthly cap, and a
              maximum number of provider calls per cron invocation.
            </p>
          </CardContent>
        </Card>

        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-base text-destructive">
              Delete account and product data
            </CardTitle>
            <CardDescription>
              Deletion requires a recent sign-in and removes your project, competitors, prompts,
              scans, and stored answers, then invalidates your sessions. If a subscription is active
              you must cancel it in the billing portal first. Questions first? Email
              support@cite-scout.com.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirming(true);
              }}
            >
              Delete my account
            </Button>
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!open) {
            setConfirming(false);
            setTyped('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                This permanently deletes your project, prompts, competitors, scans, and stored
                answers, then signs you out everywhere. It cannot be undone. If a subscription is
                active, cancel it in the billing portal first.
                <div className="mt-4 grid gap-2">
                  <Label htmlFor="delete-confirm">Type DELETE to confirm</Label>
                  <Input
                    id="delete-confirm"
                    value={typed}
                    autoComplete="off"
                    onChange={(event) => {
                      setTyped(event.target.value);
                    }}
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90 disabled:opacity-50"
              disabled={busy || typed !== 'DELETE'}
              onClick={() => {
                void deleteAccount();
              }}
            >
              {busy ? 'Deleting…' : 'Delete my account'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

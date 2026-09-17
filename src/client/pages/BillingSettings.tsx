import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { PageState } from './AppShell';
import { useDashboard } from './use-dashboard';
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

function formatScheduleDate(...candidates: (string | null)[]): string {
  const found = candidates.find(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  return found === undefined ? 'Not scheduled' : found.slice(0, 10);
}

function SubscriptionSummary({ status }: { status: BillingStatus }) {
  const subscription = status.subscription;
  if (!subscription)
    return (
      <p>
        No subscription is linked to this account. The free trial scan can be used once; daily
        monitoring starts after a verified payment.
      </p>
    );

  return (
    <dl className="billing-facts">
      <div>
        <dt>Status</dt>
        <dd>{subscription.status.replace('_', ' ')}</dd>
      </div>
      <div>
        <dt>Mode</dt>
        <dd>{subscription.testMode ? 'Lemon Squeezy test mode' : 'Live'}</dd>
      </div>
      <div>
        <dt>{subscription.endsAt ? 'Access ends' : 'Renews'}</dt>
        <dd>{formatScheduleDate(subscription.endsAt, subscription.renewsAt)}</dd>
      </div>
      {subscription.cardLastFour && (
        <div>
          <dt>Payment method</dt>
          <dd>
            {subscription.cardBrand ?? 'Card'} Â·Â·Â·Â· {subscription.cardLastFour}
          </dd>
        </div>
      )}
    </dl>
  );
}

/**
 * Checkout success is a UX signal only. Access is granted exclusively by a
 * verified Lemon Squeezy webhook, so this polls our own billing state.
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
    <div className="notice" role="status" aria-live="polite">
      <b>Confirming your subscriptionâ€¦</b>
      <span>
        Activation happens only after payment is verified by a signed Lemon Squeezy webhook. Checked{' '}
        {attempts} time(s).
      </span>
      <button
        type="button"
        className="link-button"
        onClick={() => {
          setAttempts(0);
          setManual((value) => value + 1);
        }}
      >
        Check again
      </button>
    </div>
  );
}

export function BillingPage() {
  const dashboard = useDashboard();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function loadStatus() {
    const response = await fetch('/api/billing/status');
    if (response.ok) {
      const body = (await response.json()) as { data: BillingStatus };
      setStatus(body.data);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/billing/status', { signal: controller.signal });
        if (!response.ok) return;
        const body = (await response.json()) as { data: BillingStatus };
        setStatus(body.data);
      } catch {
        // A cancelled request is expected on unmount; nothing to report.
      }
    })();
    return () => {
      controller.abort();
    };
  }, []);

  if (dashboard.state.status !== 'ready')
    return <PageState state={dashboard.state} onRetry={dashboard.reload} />;

  const checkoutComplete = params.get('checkout') === 'complete';

  return (
    <>
      <header className="app-header">
        <div>
          <p className="eyebrow">Plan and payment</p>
          <h1>Billing</h1>
        </div>
      </header>

      {checkoutComplete && (
        <ConfirmingSubscription
          onVerified={() => {
            void loadStatus();
            dashboard.reload();
            params.delete('checkout');
            setParams(params, { replace: true });
          }}
        />
      )}

      {message && (
        <p role="status" aria-live="polite" className="form-status">
          {message}
        </p>
      )}

      <section className="settings-panel">
        <h2>PromptWatch Monitor â€” $19 USD / month</h2>
        <SubscriptionSummary
          status={status ?? { subscription: null, entitlement: dashboard.state.data.entitlement }}
        />
        <ul className="plan-list">
          <li>One active project and up to 10 enabled prompts</li>
          <li>Up to 3 tracked competitors</li>
          <li>One observation per prompt per UTC day</li>
          <li>Historical trends and the raw answer archive</li>
        </ul>

        <div className="billing-actions">
          {status?.subscription ? (
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setMessage('');
                void fetch('/api/billing/portal', { method: 'POST' })
                  .then(async (response) => {
                    const body = (await response.json()) as {
                      data?: { url: string };
                      error?: { message: string };
                    };
                    if (response.ok && body.data) window.location.assign(body.data.url);
                    else setMessage(body.error?.message ?? 'Could not open the billing portal.');
                  })
                  .catch(() => {
                    setMessage('Network error while opening the billing portal.');
                  })
                  .finally(() => {
                    setBusy(false);
                  });
              }}
            >
              {busy ? 'Openingâ€¦' : 'Manage billing'}
            </button>
          ) : (
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setMessage('');
                void fetch('/api/billing/checkout', { method: 'POST' })
                  .then(async (response) => {
                    const body = (await response.json()) as {
                      data?: { url: string };
                      error?: { message: string };
                    };
                    if (response.ok && body.data) window.location.assign(body.data.url);
                    else setMessage(body.error?.message ?? 'Could not start checkout.');
                  })
                  .catch(() => {
                    setMessage('Network error while starting checkout.');
                  })
                  .finally(() => {
                    setBusy(false);
                  });
              }}
            >
              {busy ? 'Opening checkoutâ€¦' : 'Open secure checkout'}
            </button>
          )}
          <Link className="text-link" to="/app/overview">
            Back to overview
          </Link>
        </div>

        <p className="fine">
          Checkout and the customer portal are hosted by Lemon Squeezy, the merchant of record.
          PromptWatch never stores card data. Returning from checkout does not by itself grant
          access.
        </p>
      </section>

      {status?.entitlement.warning && (
        <p role="alert" className="form-error">
          Your subscription is {status.entitlement.warning}. New provider calls are paused;
          historical data remains available. Coverage of your archive is unaffected.
        </p>
      )}

      {dashboard.state.data.totalObservations > 0 && (
        <p className="fine">
          Stored observations retained on this account:{' '}
          {String(dashboard.state.data.totalObservations)}. Recent coverage:{' '}
          {fmtPercent(dashboard.state.data.current.coverage)}.
        </p>
      )}
    </>
  );
}

export function SettingsPage() {
  const dashboard = useDashboard();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  if (dashboard.state.status !== 'ready')
    return <PageState state={dashboard.state} onRetry={dashboard.reload} />;
  const data = dashboard.state.data;

  async function deleteAccount() {
    const confirmation = window.prompt(
      'This permanently deletes your project, prompts, competitors, scans, and stored answers. Type DELETE to confirm.',
    );
    if (confirmation !== 'DELETE') {
      setMessage('Account deletion cancelled.');
      return;
    }
    setBusy(true);
    setMessage('');
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
      setMessage(body.error?.message ?? 'Account deletion failed.');
    } catch {
      setMessage('Network error while deleting the account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="app-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>Project settings</h1>
        </div>
      </header>

      <section className="settings-panel">
        <h2>Tracked identity</h2>
        <dl className="billing-facts">
          <div>
            <dt>Brand</dt>
            <dd>{data.brandName}</dd>
          </div>
          <div>
            <dt>Canonical domain</dt>
            <dd>{data.canonicalDomain}</dd>
          </div>
          <div>
            <dt>Competitors</dt>
            <dd>
              {data.shareOfVoiceByEntity
                .filter((entity) => entity.key !== 'brand')
                .map((entity) => entity.label)
                .join(', ') || 'None'}
            </dd>
          </div>
          <div>
            <dt>Provider</dt>
            <dd>
              {data.provider
                ? `${data.provider.name} Â· ${data.provider.model ?? 'unknown model'}`
                : 'No calls yet'}
            </dd>
          </div>
        </dl>
      </section>

      <section className="settings-panel">
        <h2>Provider usage</h2>
        <p>
          Stored observations: {String(data.totalObservations)}. Cost controls are enforced
          server-side, including a global daily cap, a per-user monthly cap, and a maximum number of
          provider calls per cron invocation.
        </p>
      </section>

      <section className="settings-panel">
        <h2>Delete account and product data</h2>
        <p>
          Deletion requires a recent sign-in and removes your project, competitors, prompts, scans,
          and stored answers, then invalidates your sessions. If a subscription is active you must
          cancel it in the billing portal first. Minimal billing identifiers may be retained where
          legally required.
        </p>
        <button
          type="button"
          className="button danger"
          disabled={busy}
          onClick={() => void deleteAccount()}
        >
          {busy ? 'Deletingâ€¦' : 'Delete my account'}
        </button>
        {message && (
          <p role="status" aria-live="polite" className="form-status">
            {message}
          </p>
        )}
      </section>
    </>
  );
}

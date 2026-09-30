import { LoaderCircle, Radar } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button } from './ui/button';
import type { DashboardPayload } from '@/shared/dashboard';

export function ScanAction({ data, onDone }: { data: DashboardPayload; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const available = data.scanAvailability;
  const trial = available.trialAvailable;
  async function scan() {
    setBusy(true);
    try {
      const response = await fetch(`/api/scans/${trial ? 'trial' : 'today'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: data.projectId,
          promptIds: available.eligiblePromptIds.slice(0, trial ? 3 : 10),
        }),
      });
      const body = (await response.json()) as {
        data?: {
          status: string;
          successful: number;
          failed: number;
          deferred: number;
          skipped: number;
          reason: string | null;
        };
        error?: { message: string };
      };
      if (!response.ok || !body.data)
        throw new Error(body.error?.message ?? 'Could not start the scan.');
      const result = body.data;
      const message = `${String(result.successful)} observed · ${String(result.failed)} failed · ${String(result.deferred)} deferred · ${String(result.skipped)} already reserved`;
      if (result.status === 'completed') toast.success('Scan complete', { description: message });
      else if (result.status === 'failed') toast.error('Scan failed', { description: message });
      else
        toast.message(
          result.status === 'partial'
            ? 'Scan partially complete'
            : result.status === 'already_observed'
              ? 'Already observed today'
              : 'No new observations',
          { description: result.reason ?? message },
        );
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Network error while scanning.');
      onDone();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex max-w-sm flex-col gap-1.5">
      {!data.entitlement.canScan && !trial ? (
        <Button asChild>
          <Link to="/app/billing">Upgrade for daily monitoring</Link>
        </Button>
      ) : (
        <Button
          disabled={busy || (!trial && !available.manualAvailable)}
          aria-busy={busy}
          onClick={() => {
            void scan();
          }}
        >
          {busy ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Radar className="size-4" aria-hidden="true" />
          )}
          {busy
            ? 'Scanning…'
            : trial
              ? 'Run free trial scan'
              : available.manualAvailable
                ? "Run today's scan"
                : 'No scan available'}
        </Button>
      )}
      {available.reason && (
        <p className="text-xs leading-relaxed text-muted-foreground">{available.reason}</p>
      )}
      {busy && (
        <span role="status" className="text-xs text-muted-foreground">
          Collecting answers and returned sources…
        </span>
      )}
    </div>
  );
}

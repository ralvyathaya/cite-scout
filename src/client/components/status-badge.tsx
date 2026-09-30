import { CheckCircle2, Circle, CircleMinus, TriangleAlert } from 'lucide-react';
import type { ObservationInsight } from '@/domain/insights';
import { Badge } from '@/client/components/ui/badge';
import { cn } from '@/client/lib/utils';

export type Classification =
  'displaced' | 'recommended' | 'mentioned' | 'negative' | 'absent' | 'unknown';

function normalize(classification: string | null): Classification {
  if (
    classification === 'displaced' ||
    classification === 'recommended' ||
    classification === 'mentioned' ||
    classification === 'negative' ||
    classification === 'absent'
  ) {
    return classification;
  }
  return 'unknown';
}

const classificationStyles: Record<Classification, string> = {
  displaced: 'bg-amber-50 text-amber-800 border border-amber-200',
  recommended: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  mentioned: 'bg-zinc-100 text-zinc-600 border border-zinc-200',
  negative: 'bg-red-50 text-red-700 border border-red-200',
  absent: 'bg-red-50/60 text-red-700 border border-red-200/80',
  unknown: 'bg-zinc-50 text-zinc-600 border border-zinc-200',
};

const classificationLabels: Record<Classification, string> = {
  displaced: 'Displaced by Competitor',
  recommended: 'Recommended',
  mentioned: 'Mentioned',
  negative: 'Negative',
  absent: 'Absent',
  unknown: 'Not yet scanned',
};

/** Single source of truth for brand-status presentation across the app. */
export function StatusBadge({
  classification,
  className,
  unknownLabel,
}: {
  classification: string | null;
  className?: string;
  unknownLabel?: string;
}) {
  const key = normalize(classification);
  const Icon =
    key === 'recommended'
      ? CheckCircle2
      : key === 'displaced' || key === 'negative'
        ? TriangleAlert
        : key === 'absent'
          ? CircleMinus
          : Circle;
  return (
    <Badge variant="outline" className={cn(classificationStyles[key], className)}>
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      {key === 'unknown' ? (unknownLabel ?? classificationLabels[key]) : classificationLabels[key]}
    </Badge>
  );
}

export function ObservationSignal({
  insight,
  attemptStatus,
}: {
  insight: ObservationInsight;
  attemptStatus?: string | null;
}) {
  return (
    <div className="space-y-1.5">
      <StatusBadge
        classification={insight.status}
        unknownLabel={
          attemptStatus === 'failed'
            ? 'No successful observation'
            : attemptStatus === 'reserved'
              ? 'Observation pending'
              : undefined
        }
      />
      {insight.explanation && (
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
          {insight.explanation}
        </p>
      )}
      {insight.context === 'negative' && (
        <p className="text-xs text-red-700">Negative brand context detected</p>
      )}
      {insight.status !== 'unknown' && attemptStatus === 'failed' && (
        <p className="text-xs text-muted-foreground">
          Latest attempt failed; showing the last stored answer.
        </p>
      )}
    </div>
  );
}

import { Badge } from '@/client/components/ui/badge';
import { cn } from '@/client/lib/utils';

export type Classification = 'recommended' | 'mentioned' | 'negative' | 'absent' | 'unknown';

function normalize(classification: string | null): Classification {
  if (
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
  recommended: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  mentioned: 'bg-zinc-100 text-zinc-600 border border-zinc-200',
  negative: 'bg-red-50 text-red-700 border border-red-200',
  absent: 'bg-zinc-50 text-zinc-400 border border-zinc-200',
  unknown: 'bg-zinc-50 text-zinc-400 border border-zinc-200',
};

const classificationLabels: Record<Classification, string> = {
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
}: {
  classification: string | null;
  className?: string;
}) {
  const key = normalize(classification);
  return (
    <Badge variant="outline" className={cn(classificationStyles[key], className)}>
      {classificationLabels[key]}
    </Badge>
  );
}

import type { ReactNode } from 'react';
import {
  BookOpen,
  CreditCard,
  FileSearch,
  Globe,
  Settings,
  Stethoscope,
  Users,
  ClipboardCheck,
  ListChecks,
  ChartNoAxesCombined,
} from 'lucide-react';

const pageIcons: Partial<Record<string, typeof BookOpen>> = {
  Prompts: ListChecks,
  Answers: FileSearch,
  Trends: ChartNoAxesCombined,
  'Answer details': FileSearch,
  Diagnoses: Stethoscope,
  'Action Playbook': ClipboardCheck,
  'Action brief': ClipboardCheck,
  Sources: Globe,
  Competitors: Users,
  'Billing & usage': CreditCard,
  Settings,
};

export function WorkspaceHeading({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  const Icon = pageIcons[title] ?? BookOpen;
  return (
    <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 max-w-3xl space-y-1.5">
        <h1 className="flex items-center gap-3 break-words text-2xl font-semibold tracking-tight">
          <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
          {title}
        </h1>
        {description && (
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </header>
  );
}

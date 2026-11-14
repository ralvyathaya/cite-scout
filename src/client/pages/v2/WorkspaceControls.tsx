import { useId, useState, type ReactElement, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '../../components/ui/dialog';

export function WorkspaceModal({
  title,
  description,
  trigger,
  children,
  footer,
  wide = false,
  open,
  onOpenChange,
}: {
  title: string;
  description?: string;
  trigger: ReactElement;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className={`workspace-theme workspace-modal flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden bg-card p-0 ${wide ? 'sm:max-w-[960px]' : 'sm:max-w-[560px]'}`}
        {...(description ? {} : { 'aria-describedby': undefined })}
      >
        <header className="min-w-0 shrink-0 break-words border-b px-5 py-4 pr-14">
          <DialogTitle className="break-words text-lg font-medium leading-6">{title}</DialogTitle>
          {description && (
            <DialogDescription className="mt-1 break-words text-sm leading-5">
              {description}
            </DialogDescription>
          )}
        </header>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-5">{children}</div>
        {footer && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t px-5 py-4">
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface Choice {
  value: string;
  label: string;
}
export function ChoiceButtons({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly Choice[];
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex min-w-0 flex-wrap gap-1 rounded-lg border bg-card p-1"
    >
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={value === option.value ? 'secondary' : 'ghost'}
          aria-pressed={value === option.value}
          onClick={() => {
            onChange(option.value);
          }}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

export function ChoiceList({
  label,
  value,
  onChange,
  options,
  searchable = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly Choice[];
  searchable?: boolean;
}) {
  const name = useId();
  const [search, setSearch] = useState('');
  const visible = options.filter((option) =>
    option.label.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <fieldset className="min-w-0 space-y-2">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      {searchable && (
        <Input
          aria-label={`Search ${label.toLowerCase()}`}
          placeholder="Search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
      )}
      <div className="max-h-64 space-y-1 overflow-y-auto overscroll-contain">
        {visible.map((option) => (
          <label
            key={option.value}
            className="flex min-h-10 cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-sm hover:bg-muted"
          >
            <input
              className="mt-1 size-4 shrink-0 accent-primary"
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => {
                onChange(option.value);
              }}
            />
            <span className="min-w-0 break-words">{option.label}</span>
          </label>
        ))}
        {!visible.length && (
          <p className="p-3 text-sm text-muted-foreground">No matching choices</p>
        )}
      </div>
    </fieldset>
  );
}

export function ActiveFilters({
  items,
}: {
  items: readonly { key: string; label: string; onRemove: () => void }[];
}) {
  if (!items.length) return null;
  return (
    <div aria-label="Active filters" className="flex min-w-0 flex-wrap gap-2">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={item.onRemove}
          aria-label={`Remove ${item.label} filter`}
          className="flex min-h-8 max-w-full items-center gap-2 rounded-md border bg-card px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted"
        >
          <span className="min-w-0 break-words">{item.label}</span>
          <X className="size-3 shrink-0" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

import { useId, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { Bug, CheckCircle2, Lightbulb, LoaderCircle, MessageSquare } from 'lucide-react';
import {
  feedbackMessageLimit,
  feedbackMessageMinimum,
  feedbackRecipient,
  type FeedbackInput,
} from '../../shared/feedback';
import { WorkspaceModal } from '../pages/v2/WorkspaceControls';
import { api, ApiError } from '../pages/v2/api';
import { fixtureMode } from '../pages/v2/geo-fixture-mode';
import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';

export function FeedbackButton({
  children,
  className,
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const formId = useId();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackInput['kind']>('other');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const attempt = useRef<{ payload: string; requestId: string } | null>(null);
  const synthetic = fixtureMode().requested;

  return (
    <WorkspaceModal
      title={submitted ? 'Thanks for your feedback' : 'Tell us what you think'}
      description={
        submitted
          ? undefined
          : 'Bug, idea, or anything else — send it directly to the CiteScout team.'
      }
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn('h-auto min-h-9 whitespace-normal text-left', className)}
          aria-label={ariaLabel}
        >
          {children}
        </Button>
      }
      open={open}
      onOpenChange={(value) => {
        if (pending.current) return;
        if (value && submitted) setSubmitted(false);
        setOpen(value);
      }}
      footer={
        submitted ? (
          <Button
            onClick={() => {
              setOpen(false);
            }}
          >
            Done
          </Button>
        ) : (
          <Button
            type="submit"
            form={formId}
            className="w-full"
            disabled={busy || synthetic || message.trim().length < feedbackMessageMinimum}
          >
            {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
            {busy ? 'Sending…' : 'Send feedback'}
          </Button>
        )
      }
    >
      {submitted ? (
        <div role="status" className="flex items-start gap-3 text-sm">
          <CheckCircle2 className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p>
            Your feedback has been submitted to our support team. If you left an email, we can reply
            there.
          </p>
        </div>
      ) : (
        <form
          id={formId}
          className="space-y-5"
          aria-busy={busy}
          onSubmit={(event) => {
            event.preventDefault();
            if (pending.current || synthetic) return;
            const body = {
              kind,
              message: message.trim(),
              ...(email.trim() ? { email: email.trim().toLowerCase() } : {}),
              page: pathname,
            };
            const payload = JSON.stringify(body);
            if (attempt.current?.payload !== payload)
              attempt.current = { payload, requestId: crypto.randomUUID() };
            const requestId = attempt.current.requestId;
            pending.current = true;
            setBusy(true);
            setError(null);
            void (async () => {
              try {
                const result = await api<{ submitted: boolean }>(
                  '/api/feedback',
                  { ...body, requestId },
                  'POST',
                  AbortSignal.timeout(15_000),
                );
                if (!result.submitted)
                  throw new Error('Feedback could not be submitted. Please try again.');
                setSubmitted(true);
                setMessage('');
                setEmail('');
                setKind('other');
                attempt.current = null;
              } catch (reason) {
                setError(
                  reason instanceof ApiError
                    ? reason.message
                    : 'We couldn’t confirm your feedback was submitted. Your message is still here; please try again.',
                );
              } finally {
                pending.current = false;
                setBusy(false);
              }
            })();
          }}
        >
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          {synthetic && (
            <p className="text-sm text-muted-foreground">
              Feedback is not sent from this synthetic workspace.
            </p>
          )}
          <fieldset disabled={busy} className="space-y-2">
            <legend className="mb-2 text-sm font-medium">What kind of feedback?</legend>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['bug', 'Bug', Bug],
                  ['idea', 'Idea', Lightbulb],
                  ['other', 'Other', MessageSquare],
                ] as const
              ).map(([value, label, Icon]) => (
                <label key={value} className="cursor-pointer">
                  <input
                    type="radio"
                    name={`${formId}-kind`}
                    value={value}
                    checked={kind === value}
                    onChange={() => {
                      setKind(value);
                    }}
                    className="peer sr-only"
                  />
                  <span className="flex min-h-11 items-center gap-2 rounded-md border px-4 text-sm peer-checked:border-foreground peer-checked:bg-muted peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-disabled:opacity-50">
                    <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="space-y-2 text-sm">
            <label className="font-medium" htmlFor={`${formId}-message`}>
              Your message
            </label>
            <Textarea
              id={`${formId}-message`}
              required
              minLength={feedbackMessageMinimum}
              maxLength={feedbackMessageLimit}
              rows={6}
              disabled={busy}
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);
              }}
              placeholder="What’s working? What’s broken? What would you change?"
              aria-describedby={`${formId}-message-help`}
              className="min-h-36 resize-y font-normal"
            />
            <span
              id={`${formId}-message-help`}
              className="block text-xs font-normal text-muted-foreground"
            >
              {message.length.toLocaleString()} / {feedbackMessageLimit.toLocaleString()} characters
              · at least {feedbackMessageMinimum}
            </span>
          </div>
          <label className="block space-y-2 text-sm font-medium" htmlFor={`${formId}-email`}>
            <span>
              Email{' '}
              <span className="font-normal text-muted-foreground">
                (optional — so we can reply)
              </span>
            </span>
            <Input
              id={`${formId}-email`}
              type="email"
              autoComplete="email"
              maxLength={254}
              disabled={busy}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
              placeholder="you@company.com"
              className="font-normal"
            />
          </label>
          <p className="text-xs leading-5 text-muted-foreground">
            Sent to {feedbackRecipient} with your current app page and account ID. Please leave out
            passwords, API keys and payment details.
          </p>
        </form>
      )}
    </WorkspaceModal>
  );
}

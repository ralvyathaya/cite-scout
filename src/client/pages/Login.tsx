import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router';
import { GoogleColorIcon } from '@/client/components/brand-icons';
import { BrandLogo } from '@/client/components/BrandLogo';
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
import { usePageTitle } from '@/client/use-page-title';

interface LoginResponse {
  data?: { accepted: boolean; message: string };
  error?: { message: string };
}

export function Login() {
  usePageTitle('Sign in');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const widget = useRef<HTMLDivElement>(null);

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    setStatus('idle');
    setMessage('');
    try {
      const response = await fetch('/api/auth/sign-in/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          provider: 'google',
          callbackURL: '/app/overview',
          disableRedirect: true,
        }),
      });
      const body = (await response.json()) as {
        url?: string;
        code?: string;
        message?: string;
        error?: { message?: string };
      };
      if (!response.ok || !body.url) {
        throw new Error(
          body.code === 'PROVIDER_NOT_FOUND'
            ? 'Google sign-in is not configured here yet. Use a secure email link instead.'
            : (body.error?.message ??
                body.message ??
                'Google sign-in is unavailable. Try again or use a secure email link.'),
        );
      }
      window.location.href = body.url;
    } catch (error) {
      setMessage(
        error instanceof Error && error.name === 'TimeoutError'
          ? 'Google sign-in took too long. Try again or use a secure email link.'
          : error instanceof Error
            ? error.message
            : 'Google sign-in failed. Try again or use a secure email link.',
      );
      setStatus('error');
      setGoogleLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void fetch('/api/public-config')
      .then(
        (response) =>
          response.json() as Promise<{
            data: {
              turnstileSiteKey: string;
              integrationsEnabled: boolean;
            };
          }>,
      )
      .then(({ data }) => {
        if (!active) return;
        if (!data.integrationsEnabled) {
          setTurnstileToken('local-development');
          return;
        }
        if (widget.current && window.turnstile)
          window.turnstile.render(widget.current, {
            sitekey: data.turnstileSiteKey,
            action: 'magic_link',
            size: 'compact',
            callback: setTurnstileToken,
            'expired-callback': () => {
              setTurnstileToken('');
            },
          });
      })
      .catch(() => {
        if (active) {
          setStatus('error');
          setMessage('Could not load email verification. Refresh to try email sign-in again.');
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('sending');
    try {
      const response = await fetch('/api/login/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          turnstileToken,
          callbackURL: '/app/overview',
        }),
      });
      const body = (await response.json()) as LoginResponse;
      if (!response.ok) throw new Error(body.error?.message ?? 'Unable to request a link.');
      setMessage(body.data?.message ?? 'Check your inbox.');
      setStatus('sent');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to request a link.');
      setStatus('error');
    }
  }

  return (
    <main
      id="main"
      className="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-8 sm:px-6 sm:py-12"
    >
      <div className="w-full max-w-5xl">
        <Link to="/" className="mb-8 inline-flex" aria-label="CiteScout home">
          <BrandLogo />
        </Link>
        <div className="grid items-center gap-10 md:grid-cols-[1fr_1fr] lg:gap-20">
          <section className="hidden min-w-0 space-y-6 md:block" aria-label="Your workspace">
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                Your evidence workspace
              </p>
              <h2 className="max-w-sm text-3xl font-semibold leading-tight tracking-tight lg:text-4xl">
                Come back to the evidence.
              </h2>
              <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                Keep your buyer questions, returned answers, and source evidence together.
              </p>
            </div>
            <div className="space-y-4 border-l-2 border-primary/20 pl-5">
              <div>
                <p className="text-sm font-medium">Questions in context</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Return to the prompts and checks you have already saved.
                </p>
              </div>
              <div>
                <p className="text-sm font-medium">Answers you can inspect</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Read the original response and inspect its returned sources.
                </p>
              </div>
            </div>
            <p className="max-w-md text-xs leading-relaxed text-muted-foreground">
              GEO is in preview and depends on account access. Signing in does not start a
              monitoring run or a subscription.
            </p>
          </section>

          <Card className="mx-auto w-full min-w-0 max-w-md shadow-sm">
            <CardHeader>
              <CardTitle>
                <h1 className="text-2xl font-semibold tracking-tight">Sign in to CiteScout</h1>
              </CardTitle>
              <CardDescription className="leading-relaxed">
                Sign in to inspect saved answers to your buyers’ questions. Use your Google account
                or a secure email link; no password needed.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex min-w-0 flex-col gap-4">
              <Button
                type="button"
                variant="outline"
                disabled={googleLoading || status === 'sending'}
                aria-busy={googleLoading}
                onClick={() => {
                  void handleGoogleSignIn();
                }}
                className="flex w-full items-center justify-center gap-2.5 font-medium shadow-none hover:bg-accent"
              >
                <GoogleColorIcon className="size-4 shrink-0" />
                <span>{googleLoading ? 'Connecting to Google…' : 'Continue with Google'}</span>
              </Button>

              <div className="relative my-0.5 text-center text-xs text-muted-foreground after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
                <span className="relative z-10 bg-card px-2">or continue with work email</span>
              </div>
              <form
                className="flex min-w-0 flex-col gap-4"
                onSubmit={(event) => {
                  void submit(event);
                }}
              >
                <div className="grid gap-2">
                  <Label htmlFor="email">Work email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                    }}
                    placeholder="you@company.com"
                  />
                </div>

                <div ref={widget} className="min-h-10 max-w-full">
                  {turnstileToken === 'local-development' && (
                    <p className="text-xs text-muted-foreground">
                      Dev mode: the sign-in link is printed in the dev server terminal after you
                      submit.
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={status === 'sending' || googleLoading || !turnstileToken}
                >
                  {status === 'sending' ? 'Sending…' : 'Email my secure link'}
                </Button>

                <p
                  role="status"
                  aria-live="polite"
                  className={`min-h-4 break-words text-sm leading-relaxed ${
                    message
                      ? status === 'error'
                        ? 'rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive'
                        : 'rounded-lg border border-primary/20 bg-primary/5 p-3 text-foreground'
                      : 'text-muted-foreground'
                  }`}
                >
                  {message}
                </p>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      <p className="mt-8 max-w-md text-center text-xs leading-relaxed text-muted-foreground">
        Links are single-use and expire after 10 minutes. By continuing you agree to our{' '}
        <Link to="/terms" className="underline underline-offset-4 hover:text-foreground">
          Terms
        </Link>{' '}
        and{' '}
        <Link to="/privacy" className="underline underline-offset-4 hover:text-foreground">
          Privacy Policy
        </Link>
        .
      </p>
    </main>
  );
}

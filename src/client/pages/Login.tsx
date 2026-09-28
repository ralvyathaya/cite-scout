import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router';
import { GoogleColorIcon } from '@/client/components/brand-icons';
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
        body: JSON.stringify({
          provider: 'google',
          callbackURL: '/app/overview',
        }),
      });
      const body = (await response.json()) as { url?: string; error?: { message?: string } };
      if (!response.ok || !body.url) {
        throw new Error(body.error?.message ?? 'Google sign-in is not configured or unavailable.');
      }
      window.location.href = body.url;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Google sign-in failed.');
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
            data: { turnstileSiteKey: string; integrationsEnabled: boolean };
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
            callback: setTurnstileToken,
            'expired-callback': () => {
              setTurnstileToken('');
            },
          });
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
      className="flex min-h-svh flex-col items-center justify-center bg-muted/50 px-4 py-12"
    >
      <Link to="/" className="mb-8 flex items-center gap-2" aria-label="CiteScout home">
        <span className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold italic text-primary-foreground">
          CS
        </span>
        <span className="text-lg font-bold tracking-tight">CiteScout</span>
      </Link>

      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-bold tracking-tight">
            <h1 className="text-xl font-bold tracking-tight">Sign in to CiteScout</h1>
          </CardTitle>
          <CardDescription>
            Choose your preferred sign-in method to continue.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Button
            type="button"
            variant="outline"
            disabled={googleLoading || status === 'sending'}
            onClick={() => {
              void handleGoogleSignIn();
            }}
            className="flex w-full items-center justify-center gap-2.5 font-medium shadow-xs hover:bg-accent"
          >
            <GoogleColorIcon className="size-4 shrink-0" />
            <span>{googleLoading ? 'Connecting to Google…' : 'Continue with Google'}</span>
          </Button>

          <div className="relative my-0.5 text-center text-xs text-muted-foreground after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
            <span className="relative z-10 bg-card px-2">or continue with work email</span>
          </div>

          <form
            className="flex flex-col gap-4"
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

            <div ref={widget} className="min-h-10">
              {turnstileToken === 'local-development' && (
                <p className="text-xs text-muted-foreground">
                  Dev mode: the sign-in link is printed in the dev server terminal after you submit.
                </p>
              )}
            </div>

            <Button type="submit" disabled={status === 'sending' || googleLoading || !turnstileToken}>
              {status === 'sending' ? 'Sending…' : 'Email my secure link'}
            </Button>

            <p
              role="status"
              aria-live="polite"
              className={`min-h-4 text-center text-xs ${
                status === 'error' ? 'text-destructive' : 'text-muted-foreground'
              }`}
            >
              {message}
            </p>
          </form>
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-xs text-muted-foreground">
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

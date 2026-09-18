import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router';
import { usePageTitle } from '../use-page-title';

interface LoginResponse {
  data?: { accepted: boolean; message: string };
  error?: { message: string };
}
export function Login() {
  usePageTitle('Sign in');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const widget = useRef<HTMLDivElement>(null);
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
    <main className="auth-page" id="main">
      <section>
        <Link className="logo" to="/">
          <span>CS</span>CiteScout
        </Link>
        <div className="auth-copy">
          <p className="eyebrow">Passwordless access</p>
          <h1>Start with one honest observation.</h1>
          <p>
            Configure your brand and choose up to three prompts for a genuine Perplexity-based trial
            scan.
          </p>
        </div>
      </section>
      <section className="auth-form">
        <form
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <p className="eyebrow">Sign in</p>
          <h2>Send me a magic link</h2>
          <label htmlFor="email">Work email</label>
          <input
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
          <div ref={widget} className="turnstile-placeholder">
            {turnstileToken === 'local-development'
              ? 'Verification is being prepared. If this message persists, email support@cite-scout.com.'
              : 'Security verification'}
          </div>
          <button className="button" disabled={status === 'sending' || !turnstileToken}>
            {status === 'sending' ? 'Sending…' : 'Email my secure link'}
          </button>
          <p
            role="status"
            aria-live="polite"
            className={status === 'error' ? 'form-error' : 'form-status'}
          >
            {message}
          </p>
          <small>Links are single-use and expire after 10 minutes.</small>
        </form>
      </section>
    </main>
  );
}

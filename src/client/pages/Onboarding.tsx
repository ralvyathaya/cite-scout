import { useState, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router';
import { useDashboardContext } from './dashboard-context';
import { usePageTitle } from '../use-page-title';

export function Onboarding() {
  usePageTitle('Project setup');
  const navigate = useNavigate();
  const { reload } = useDashboardContext();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    const competitorValue = data.get('competitors');
    const promptValue = data.get('prompts');
    const competitors = (typeof competitorValue === 'string' ? competitorValue : '')
      .split('\n')
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => ({ name }));
    const prompts = (typeof promptValue === 'string' ? promptValue : '')
      .split('\n')
      .map((text) => text.trim())
      .filter(Boolean);

    try {
      const response = await fetch('/api/project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.get('name'),
          brandName: data.get('brandName'),
          canonicalDomain: data.get('domain'),
          competitors,
          prompts,
        }),
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message: string } };
        setError(body.error?.message ?? 'Could not create the project.');
        return;
      }

      const body = (await response.json()) as { data: { id: string; promptIds: string[] } };
      const scan = await fetch('/api/scans/trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: body.data.id,
          promptIds: body.data.promptIds.slice(0, 3),
        }),
      });
      if (!scan.ok) {
        setError(
          'Your project was created, but the trial scan could not start. Email support@cite-scout.com before retrying.',
        );
        return;
      }

      // Refresh the shell's dashboard state BEFORE navigating, otherwise the
      // overview would render the stale onboarding state for the new project.
      reload();
      void navigate('/app/overview');
    } catch {
      setError('Network error while creating the project. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="onboarding shell" id="main">
      <p className="eyebrow">Project setup · About 3 minutes</p>
      <h1>What should CiteScout look for?</h1>
      <form
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <div className="field-grid">
          <label>
            Project name
            <input name="name" required maxLength={80} placeholder="OrbitCal visibility" />
          </label>
          <label>
            Brand name
            <small>The exact name your customers would type into an AI chat.</small>
            <input name="brandName" required maxLength={80} placeholder="OrbitCal" />
          </label>
        </div>
        <label>
          Canonical domain
          <small>Your website's primary domain, without https:// or www.</small>
          <input name="domain" required placeholder="orbitcal.com" />
        </label>
        <label>
          Competitors <small>One per line, maximum three</small>
          <textarea name="competitors" rows={3} placeholder={'Calendly\nCal.com\nSavvyCal'} />
        </label>
        <label>
          Buyer-style prompts <small>One per line, 3–10 prompts</small>
          <textarea
            name="prompts"
            required
            rows={8}
            placeholder={
              'What is the best scheduling tool for independent consultants?\nAlternatives to Calendly for freelancers\nBest lightweight booking software for a solo consultant'
            }
          />
          <small>
            Write them as your buyers would ask an AI assistant — specific, natural questions work
            best.
          </small>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button" disabled={busy}>
          {busy ? 'Creating project…' : 'Create project'}
        </button>
        <p className="fine">
          Creating a project starts your one-time trial scan of up to three prompts. New provider
          calls only happen after that with an active subscription.
        </p>
      </form>
    </main>
  );
}

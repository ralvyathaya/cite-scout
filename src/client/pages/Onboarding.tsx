import { useState, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router';

export function Onboarding() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
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
    if (response.ok) {
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
          'Your project was created, but the trial scan could not start. Contact support before retrying.',
        );
        return;
      }
      void navigate('/app/overview');
      return;
    }
    const body = (await response.json()) as { error?: { message: string } };
    setError(body.error?.message ?? 'Could not create the project.');
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
            <input name="brandName" required maxLength={80} placeholder="OrbitCal" />
          </label>
        </div>
        <label>
          Canonical domain
          <input name="domain" required placeholder="orbitcal.com" />
        </label>
        <label>
          Competitors <small>One per line, maximum three</small>
          <textarea name="competitors" rows={4} placeholder={'Calendly\nCal.com\nSavvyCal'} />
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
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button">Create project</button>
      </form>
    </main>
  );
}

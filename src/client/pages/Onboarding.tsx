import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router';
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
import { Textarea } from '@/client/components/ui/textarea';
import { usePageTitle } from '@/client/use-page-title';
import { useDashboardContext } from './dashboard-context';

const steps = [
  { title: 'Your brand', description: 'What CiteScout should look for in AI answers.' },
  { title: 'Competitors', description: 'Up to three alternatives tracked alongside you.' },
  { title: 'Prompts', description: 'The buyer-style questions your customers ask AI.' },
] as const;

interface ProjectDraft {
  name: string;
  brandName: string;
  domain: string;
  competitors: string;
  prompts: string;
}

export function Onboarding() {
  usePageTitle('Project setup');
  const navigate = useNavigate();
  const { reload } = useDashboardContext();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ProjectDraft>({
    name: '',
    brandName: '',
    domain: '',
    competitors: '',
    prompts: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function set(key: 'name' | 'brandName' | 'domain' | 'competitors' | 'prompts', value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function canAdvance(): boolean {
    if (step === 0) return draft.brandName.trim() !== '' && draft.domain.trim() !== '';
    if (step === 1) return true;
    return draft.prompts.trim() !== '';
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const competitors = draft.competitors
      .split('\n')
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => ({ name }));
    const prompts = draft.prompts
      .split('\n')
      .map((text) => text.trim())
      .filter(Boolean);

    try {
      const response = await fetch('/api/project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name || `${draft.brandName} visibility`,
          brandName: draft.brandName,
          canonicalDomain: draft.domain,
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

      reload();
      void navigate('/app/overview');
    } catch {
      setError('Network error while creating the project. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const currentStep = steps[step] ?? steps[0];

  return (
    <div className="mx-auto w-full max-w-xl px-6 py-10 lg:py-16">
      <h1 className="sr-only">Project setup</h1>
      <div className="mb-8 flex items-center justify-between">
        {steps.map((s, index) => {
          const done = index < step;
          const active = index === step;
          return (
            <div key={s.title} className="flex items-center gap-2.5">
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                  done
                    ? 'border-primary bg-primary text-primary-foreground'
                    : active
                      ? 'border-primary text-primary'
                      : 'border-border text-muted-foreground'
                }`}
                aria-current={active ? 'step' : undefined}
              >
                {done ? <Check className="size-3.5" aria-hidden="true" /> : index + 1}
              </span>
              <span
                className={`hidden text-sm font-medium sm:block ${
                  active ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                {s.title}
              </span>
              {index < steps.length - 1 && <span className="mx-1 h-px w-6 bg-border sm:w-10" />}
            </div>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{currentStep.title}</CardTitle>
          <CardDescription>{currentStep.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => {
              void submit(event);
            }}
            className="flex flex-col gap-4"
          >
            {step === 0 && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="brandName">Brand name</Label>
                    <Input
                      id="brandName"
                      value={draft.brandName}
                      onChange={(event) => {
                        set('brandName', event.target.value);
                      }}
                      placeholder="OrbitCal"
                      required
                      maxLength={80}
                    />
                    <p className="text-xs text-muted-foreground">
                      The exact name your customers would type into an AI chat.
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="name">Project name</Label>
                    <Input
                      id="name"
                      value={draft.name}
                      onChange={(event) => {
                        set('name', event.target.value);
                      }}
                      placeholder="OrbitCal visibility"
                      maxLength={80}
                    />
                    <p className="text-xs text-muted-foreground">
                      Internal label. Leave empty to use the brand name.
                    </p>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="domain">Canonical domain</Label>
                  <Input
                    id="domain"
                    value={draft.domain}
                    onChange={(event) => {
                      set('domain', event.target.value);
                    }}
                    placeholder="orbitcal.com"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Your website&apos;s primary domain, without https:// or www.
                  </p>
                </div>
              </>
            )}

            {step === 1 && (
              <div className="grid gap-2">
                <Label htmlFor="competitors">Competitors</Label>
                <Textarea
                  id="competitors"
                  rows={3}
                  value={draft.competitors}
                  onChange={(event) => {
                    set('competitors', event.target.value);
                  }}
                  placeholder={'Calendly\nCal.com\nSavvyCal'}
                />
                <p className="text-xs text-muted-foreground">
                  One per line, maximum three. These are tracked alongside your brand in every
                  answer.
                </p>
              </div>
            )}

            {step === 2 && (
              <div className="grid gap-2">
                <Label htmlFor="prompts">Buyer-style prompts</Label>
                <Textarea
                  id="prompts"
                  rows={8}
                  value={draft.prompts}
                  onChange={(event) => {
                    set('prompts', event.target.value);
                  }}
                  placeholder={
                    'What is the best scheduling tool for independent consultants?\nAlternatives to Calendly for freelancers\nBest lightweight booking software for a solo consultant'
                  }
                  required
                />
                <p className="text-xs text-muted-foreground">
                  One per line, 3–10 prompts. Write them as your buyers would ask an AI assistant —
                  specific, natural questions work best.
                </p>
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <div className="flex items-center justify-between pt-2">
              {step > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setStep(step - 1);
                    setError('');
                  }}
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  Back
                </Button>
              ) : (
                <span />
              )}
              {step < steps.length - 1 ? (
                <Button
                  type="button"
                  disabled={!canAdvance()}
                  onClick={() => {
                    setStep(step + 1);
                    setError('');
                  }}
                >
                  Continue
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              ) : (
                <Button type="submit" disabled={busy || !canAdvance()}>
                  {busy ? 'Creating project…' : 'Create project'}
                </Button>
              )}
            </div>

            {step === steps.length - 1 && (
              <p className="text-xs text-muted-foreground">
                Creating a project starts your one-time trial scan of up to three prompts. New
                provider calls only happen after that with an active subscription.
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

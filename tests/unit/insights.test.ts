import { describe, expect, it } from 'vitest';
import { analyzeMentions } from '../../src/domain/mentions';
import {
  citationOpportunities,
  observationInsight,
  returnedSources,
  type ObservationEvidence,
} from '../../src/domain/insights';

const names = new Map([['cal', 'Calendly']]);
function evidence(text: string): ObservationEvidence {
  const analysis = analyzeMentions(text, { key: 'brand', name: 'OrbitCal' }, [
    { key: 'cal', name: 'Calendly' },
  ]);
  return {
    id: text,
    rawResponseText: text,
    errorCode: null,
    brandMentioned: analysis.brandMentioned,
    brandPosition: analysis.brandPosition,
    competitorMentionsJson: JSON.stringify(analysis.competitorKeys),
    matchedTermsJson: JSON.stringify(analysis.matchedTerms),
  };
}
describe('evidence-backed observations', () => {
  it.each([
    ['OrbitCal is a strong choice. Calendly exists.', 'recommended'],
    ['OrbitCal exists. Calendly is the best option.', 'mentioned'],
    ['Calendly exists. OrbitCal is the best option.', 'displaced'],
    ['Calendly exists.', 'displaced'],
    ['Other products exist.', 'absent'],
    ['', 'unknown'],
  ])('classifies %s as %s', (text, status) => {
    expect(observationInsight(evidence(text), names).status).toBe(status);
  });
  it('does not borrow competitor sentiment and preserves negative brand context', () => {
    for (const text of [
      'We recommend against OrbitCal.',
      'We recommend avoiding OrbitCal.',
      'OrbitCal is not recommended.',
    ])
      expect(observationInsight(evidence(text), names)).toMatchObject({
        status: 'mentioned',
        context: 'negative',
      });
    expect(observationInsight(evidence('Avoid Calendly. OrbitCal exists.'), names).context).toBe(
      'mentioned',
    );
    expect(observationInsight(evidence('OrbitCal is not the best choice.'), names)).toMatchObject({
      status: 'mentioned',
      context: 'negative',
    });
    expect(
      observationInsight(evidence('OrbitCal and Calendly are the best options.'), names).status,
    ).toBe('mentioned');
  });
  it('rechecks historical matched terms without needing the current brand name', () => {
    expect(
      observationInsight(evidence('OrbitCal exists. Calendly is excellent.'), names).context,
    ).toBe('mentioned');
    expect(
      observationInsight({ ...evidence('OrbitCal is the best.'), matchedTermsJson: '[]' }, names)
        .status,
    ).toBe('mentioned');
    expect(
      observationInsight({ ...evidence('OrbitCal exists.'), errorCode: 'TIMEOUT' }, names).status,
    ).toBe('unknown');
    expect(
      observationInsight(evidence('Calendly exists.'), new Map()).displacedCompetitors[0]?.name,
    ).toBe('Unknown competitor');
  });
  it('does not turn configured competitors into evidence', () => {
    expect(observationInsight(evidence('Some other tool is recommended.'), names)).toMatchObject({
      status: 'absent',
      displacedCompetitors: [],
      explanation: null,
    });
  });
  it('validates returned sources and aggregates each host once per displaced answer', () => {
    const sources = JSON.stringify([
      { id: 1, url: 'https://www.reddit.com/a' },
      { id: 2, url: 'https://reddit.com/b' },
      { url: 'javascript:alert(1)' },
      { url: 'https://user:password@example.com' },
      { url: 'bad' },
    ]);
    expect(returnedSources(sources)).toHaveLength(2);
    const rows = [1, 2].map((id) => ({
      ...evidence('Calendly exists.'),
      id: String(id),
      citationDataJson: sources,
      promptText: `Prompt ${String(id)}`,
      observationDate: '2026-09-29',
    }));
    const opportunities = citationOpportunities(rows, names);
    expect(opportunities).toHaveLength(1);
    expect(opportunities[0]).toMatchObject({ domain: 'reddit.com', count: 2 });
    expect(opportunities[0]?.observations).toHaveLength(2);
    expect(
      citationOpportunities(
        rows.map((row) => ({ ...row, ...evidence('OrbitCal exists.') })),
        names,
      ),
    ).toEqual([]);
    expect(returnedSources('not json')).toEqual([]);
  });
  it('returns at most five domains in deterministic count/hostname order', () => {
    const row = {
      ...evidence('Calendly exists.'),
      promptText: 'Best tools',
      observationDate: '2026-09-29',
      citationDataJson: JSON.stringify(
        ['f', 'e', 'd', 'c', 'b', 'a'].map((host) => ({ url: `https://${host}.example/` })),
      ),
    };
    expect(citationOpportunities([row], names).map((item) => item.domain)).toEqual([
      'a.example',
      'b.example',
      'c.example',
      'd.example',
      'e.example',
    ]);
  });
});

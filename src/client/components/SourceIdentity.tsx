import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';
import { SourceIcon } from './brand-icons';
export { SourceIcon } from './brand-icons';
import { sourceHost } from '../lib/source-data';
import { answerQuery } from '../lib/answer-navigation';
import type { GeoObservation } from '../../shared/geo';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export function SafeSource({ url, children }: { url: string; children: ReactNode }) {
  return sourceHost(url) ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="break-words text-primary underline underline-offset-4"
    >
      {children}
      <ExternalLink className="ml-1 inline size-3" aria-hidden="true" />
    </a>
  ) : (
    <span className="break-words">{children} · invalid source URL</span>
  );
}

export function AnswerSources({ observation }: { observation: GeoObservation }) {
  const location = useLocation();
  const domains = Array.from(
    new Set(
      observation.capture.sources
        .map((source) => sourceHost(source.url))
        .filter((host) => host !== null),
    ),
  );
  if (!domains.length)
    return (
      <span className="text-xs text-muted-foreground">
        {observation.capture.sources.length ? 'Source domains unavailable' : 'No saved sources'}
      </span>
    );
  const shown = domains.slice(0, 3);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          className="mt-1 inline-flex min-h-8 items-center gap-2 rounded-sm text-xs text-muted-foreground hover:text-foreground"
          to={`/app/observations/${encodeURIComponent(observation.id)}?${answerQuery(new URLSearchParams(location.search))}#answer-sources`}
          state={{ returnTo: location.pathname + location.search }}
          aria-label={`View sources: ${shown.join(', ')}${domains.length > 3 ? ` and ${String(domains.length - 3)} more domains` : ''}`}
        >
          {shown.map((host) => (
            <SourceIcon key={host} url={`https://${host}`} />
          ))}
          {domains.length > 3 && <span>+{domains.length - 3}</span>}
          <span>View sources</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent className="workspace-theme max-w-72">
        {shown.join(' · ')}. Source identities do not establish citation use. Open for reference
        details.
      </TooltipContent>
    </Tooltip>
  );
}

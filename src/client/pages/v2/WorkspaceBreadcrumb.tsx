import { ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { answerQuery, answerReturnTo } from '../../lib/answer-navigation';

export function WorkspaceBreadcrumb({ activePage }: { activePage: string }) {
  const location = useLocation();
  const detail = /^\/app\/observations\/[^/]+$/u.test(location.pathname);
  const legacy = /^\/app\/questions\/[^/]+$/u.test(location.pathname);
  const origin = answerReturnTo(location.state);
  const answers = origin?.startsWith('/app/observations')
    ? origin
    : `/app/observations${location.search ? `?${answerQuery(new URLSearchParams(location.search))}` : ''}`;
  const parts: { label: string; to?: string; mobileHidden?: boolean }[] = detail
    ? [
        { label: 'Monitoring', to: '/app/questions', mobileHidden: true },
        { label: 'Answers', to: answers },
        { label: 'Answer details' },
      ]
    : legacy
      ? [
          { label: 'Monitoring', to: '/app/questions', mobileHidden: true },
          { label: 'Prompts', to: '/app/questions' },
          { label: 'Previous answers' },
        ]
      : [{ label: 'Workspace', mobileHidden: true }, { label: activePage }];
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 text-sm">
      <ol className="flex min-w-0 items-center gap-2 sm:gap-3">
        {parts.map((part, index) => (
          <li
            key={part.label}
            className={`min-w-0 items-center gap-2 sm:gap-3 ${part.mobileHidden ? 'hidden sm:flex' : 'flex'}`}
          >
            {index > 0 && (
              <ChevronRight
                className={`size-3 shrink-0 text-muted-foreground ${index === 1 ? 'hidden sm:block' : ''}`}
                aria-hidden="true"
              />
            )}
            {part.to ? (
              <Link className="truncate text-muted-foreground hover:text-foreground" to={part.to}>
                {part.label}
              </Link>
            ) : (
              <span
                className="truncate font-medium"
                aria-current={index === parts.length - 1 ? 'page' : undefined}
              >
                {part.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

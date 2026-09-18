import { useEffect } from 'react';

const BASE = 'CiteScout';

/**
 * Sets the browser tab title per route. Marketing routes get descriptive
 * titles for SEO; application routes get short ones for readability.
 */
export function usePageTitle(title?: string): void {
  useEffect(() => {
    document.title = title === undefined || title === BASE ? BASE : `${title} — ${BASE}`;
    return () => {
      document.title = BASE;
    };
  }, [title]);
}

import { useCallback, useEffect, useState } from 'react';
import type { DashboardPayload, LoadState } from './dashboard-view';

/**
 * Loads the authenticated workspace from the real API. The request is aborted
 * on unmount and state is only written asynchronously, so React never sees a
 * synchronous setState during render or effect commit.
 */
export function useDashboard() {
  const [state, setState] = useState<LoadState<DashboardPayload>>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch('/api/dashboard/overview', { signal: controller.signal });

        if (response.status === 401) {
          setState({ status: 'unauthenticated' });
          return;
        }
        if (!response.ok) {
          setState({ status: 'error', message: 'We could not load your workspace.' });
          return;
        }

        const body = (await response.json()) as {
          data: DashboardPayload | null;
          onboardingRequired: boolean;
        };

        if (body.onboardingRequired || body.data === null) {
          setState({ status: 'onboarding' });
          return;
        }
        setState({ status: 'ready', data: body.data });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({ status: 'error', message: 'Network error. Try again.' });
      }
    })();

    return () => {
      controller.abort();
    };
  }, [reloadToken]);

  const reload = useCallback(() => {
    setState({ status: 'loading' });
    setReloadToken((value) => value + 1);
  }, []);

  return { state, reload };
}

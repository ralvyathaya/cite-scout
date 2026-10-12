import { useCallback, useEffect, useRef, useState } from 'react';
import { fixtureMode, fixtureRequest } from './geo-fixture-mode';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
): Promise<T> {
  if (fixtureMode().requested) return (await fixtureRequest(path, body, method)) as T;
  const response = await fetch(path.startsWith('/api/') ? path : `/api/v2${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = (await response.json()) as {
    data?: T;
    error?: { message?: string; code?: string };
  };
  if (!response.ok)
    throw new ApiError(
      value.error?.message ?? 'The request could not be completed.',
      response.status,
      value.error?.code ?? 'REQUEST_FAILED',
    );
  return (/^\/geo\/observations\/[^/]+\/raw$/u.test(path) ? value : value.data) as T;
}
export function useResource<T>(
  path: string | null,
  poll: boolean | ((data: T) => boolean) = false,
): { data: T | null; error: Error | null; loading: boolean; reload: () => Promise<void> } {
  const [result, setResult] = useState<{
    path: string | null;
    data: T | null;
    error: Error | null;
  }>({ path: null, data: null, error: null });
  const generation = useRef(0);
  const reload = useCallback(async () => {
    if (!path) return;
    const current = ++generation.current;
    try {
      const value = await api<T>(path);
      if (current === generation.current) {
        setResult({ path, data: value, error: null });
      }
    } catch (reason) {
      if (current === generation.current)
        setResult((previous) => ({
          path,
          data: previous.path === path ? previous.data : null,
          error: reason instanceof Error ? reason : new Error('Could not load data.'),
        }));
    }
  }, [path]);
  useEffect(() => {
    const counter = generation;
    void reload();
    return () => {
      counter.current++;
    };
  }, [reload]);
  useEffect(() => {
    if (!poll) return;
    if (typeof poll === 'function' && result.data && !poll(result.data)) return;
    let stopped = false;
    let timer: number;
    const refresh = async () => {
      if (document.visibilityState === 'visible') await reload();
      if (!stopped)
        timer = window.setTimeout(() => {
          void refresh();
        }, 5000);
    };
    timer = window.setTimeout(() => {
      void refresh();
    }, 5000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [poll, reload, result.data]);
  return {
    data: result.path === path ? result.data : null,
    error: result.path === path ? result.error : null,
    loading: path !== null && result.path !== path,
    reload,
  };
}
export function emitEvent(
  name: 'answer_inspected' | 'source_opened' | 'comparison_inspected',
  observationId: string,
  extra: { compareToId?: string; sourceKey?: string } = {},
) {
  void api('/events', {
    events: [{ name, observationId, ...extra, occurredAt: new Date().toISOString() }],
  }).catch(() => undefined);
}
export function useInspection(observationId?: string, compareToId?: string) {
  useEffect(() => {
    if (!observationId) return;
    let timer: number | undefined;
    const start = () => {
      if (timer !== undefined) clearTimeout(timer);
      if (document.visibilityState === 'visible')
        timer = window.setTimeout(() => {
          emitEvent(
            compareToId ? 'comparison_inspected' : 'answer_inspected',
            observationId,
            compareToId ? { compareToId } : {},
          );
        }, 5000);
    };
    start();
    document.addEventListener('visibilitychange', start);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', start);
    };
  }, [observationId, compareToId]);
}

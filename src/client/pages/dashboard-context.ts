import { useOutletContext } from 'react-router';
import type { DashboardPayload, LoadState } from './dashboard-view';

export interface DashboardContext {
  state: LoadState<DashboardPayload>;
  reload: () => void;
}

/** Reads the dashboard loaded once by `AppShell`, so pages never refetch it. */
export function useDashboardContext(): DashboardContext {
  return useOutletContext<DashboardContext>();
}

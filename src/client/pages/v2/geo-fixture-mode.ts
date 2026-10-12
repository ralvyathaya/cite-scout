import { fixtureDisposition, GeoFixtureWorkspace } from './geo-fixture';
const storageKey = 'citescout-fixture-workspace';
let workspace: GeoFixtureWorkspace | undefined;
export function fixtureMode() {
  if (new URLSearchParams(window.location.search).get('fixture') === '1')
    sessionStorage.setItem(storageKey, '1');
  return fixtureDisposition(window.location.hostname, sessionStorage.getItem(storageKey) === '1');
}
export function leaveFixture() {
  sessionStorage.removeItem(storageKey);
  sessionStorage.removeItem('citescout-geo-run');
  window.location.assign('/');
}
export async function fixtureRequest(path: string, body?: unknown, method?: string) {
  const mode = fixtureMode();
  if (!mode.enabled)
    throw new Error('Fixture mode is available only on localhost. No live request was made.');
  workspace ??= new GeoFixtureWorkspace();
  return workspace.request(path.replace(/^\/api\/v2/u, ''), body, method);
}

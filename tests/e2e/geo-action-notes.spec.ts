import { expect, test } from '@playwright/test';
import { GeoFixtureWorkspace } from '../../src/client/pages/v2/geo-fixture';
import type { GeoActionDetail, GeoActionPatch } from '../../src/shared/geo-actions';

for (const draft of ['Synthetic review note: not relevant to our current buyer.', '']) {
  test(`dismiss atomically persists ${draft ? 'new' : 'cleared'} notes and retains the draft on failure`, async ({
    page,
  }) => {
    const fixture = new GeoFixtureWorkspace();
    const path = '/geo/actions/fixture-action-1';
    const detail = (await fixture.request(path)) as GeoActionDetail;
    await fixture.request(
      path,
      {
        requestId: crypto.randomUUID(),
        revision: detail.action.revision,
        notes: 'Previously saved note.',
      },
      'PATCH',
    );
    let fail = true;
    const patches: GeoActionPatch[] = [];
    const collectorPosts: string[] = [];
    await page.route('**/api/v2/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const requestPath = url.pathname.replace('/api/v2', '') + url.search;
      if (request.method() === 'POST' && url.pathname.endsWith('/geo/runs'))
        collectorPosts.push(requestPath);
      if (requestPath === path && request.method() === 'PATCH') {
        patches.push(request.postDataJSON() as GeoActionPatch);
        if (fail) {
          await route.fulfill({
            status: 503,
            json: { error: { message: 'Notes could not be saved.' } },
          });
          return;
        }
      }
      await route.fulfill({
        json: {
          data: await fixture.request(
            requestPath,
            request.method() === 'GET' ? undefined : request.postDataJSON(),
            request.method(),
          ),
        },
      });
    });
    await page.goto('/app/playbook/fixture-action-1');
    const notes = page.getByRole('textbox', { name: 'Work notes', exact: true });
    await expect(notes).toHaveValue('Previously saved note.');
    await notes.fill(draft);
    await page.getByRole('button', { name: 'Dismiss action', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Notes could not be saved.');
    await expect(notes).toHaveValue(draft);
    await expect(notes).toBeEnabled();
    expect(patches[0]).toMatchObject({ status: 'dismissed', notes: draft });
    fail = false;
    await page.getByRole('button', { name: 'Dismiss action', exact: true }).click();
    await expect(notes).toBeDisabled();
    await page.reload();
    await expect(notes).toHaveValue(draft);
    await expect(notes).toBeDisabled();
    expect(patches).toHaveLength(2);
    expect(collectorPosts).toEqual([]);
  });
}

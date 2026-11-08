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
    await page.getByRole('button', { name: 'Edit notes', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Edit work notes', exact: true });
    const notes = editor.getByRole('textbox', { name: 'Work notes', exact: true });
    await expect(notes).toHaveValue('Previously saved note.');
    await notes.fill(draft);
    await editor.getByRole('button', { name: 'Dismiss action', exact: true }).click();
    await expect(editor.getByRole('alert')).toHaveText('Notes could not be saved.');
    await expect(notes).toHaveValue(draft);
    await expect(notes).toBeEnabled();
    expect(patches[0]).toMatchObject({ status: 'dismissed', notes: draft });
    fail = false;
    await editor.getByRole('button', { name: 'Dismiss action', exact: true }).click();
    await expect(editor).toBeHidden();
    await expect(page.getByRole('button', { name: 'Edit notes', exact: true })).toBeDisabled();
    await page.reload();
    const saved = (await fixture.request(path)) as GeoActionDetail;
    expect(saved.action.notes).toBe(draft);
    await expect(page.getByRole('button', { name: 'Edit notes', exact: true })).toBeDisabled();
    expect(patches).toHaveLength(2);
    expect(collectorPosts).toEqual([]);
  });
}

test('pending notes stay open through Escape and retain the draft after a failed save', async ({
  page,
}) => {
  const fixture = new GeoFixtureWorkspace();
  const path = '/geo/actions/fixture-action-1';
  let release: () => void = () => {
    throw new Error('Pending request was not initialized.');
  };
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let fail = true;
  const paidPosts: string[] = [];
  await page.route('**/api/v2/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const current = url.pathname.replace('/api/v2', '') + url.search;
    if (request.method() === 'POST' && /runs|analyses|page-checks/.test(current))
      paidPosts.push(current);
    if (current === path && request.method() === 'PATCH' && fail) {
      await pending;
      await route.fulfill({
        status: 503,
        json: { error: { message: 'Could not save the note.' } },
      });
      return;
    }
    await route.fulfill({
      json: {
        data: await fixture.request(
          current,
          request.method() === 'GET' ? undefined : request.postDataJSON(),
          request.method(),
        ),
      },
    });
  });
  await page.goto('/app/playbook/fixture-action-1');
  await page.getByRole('button', { name: 'Edit notes', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit work notes', exact: true });
  const notes = dialog.getByRole('textbox', { name: 'Work notes', exact: true });
  await notes.fill('Keep this review draft until saving succeeds.');
  await dialog.getByRole('button', { name: 'Save notes', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Save notes', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(notes).toHaveValue('Keep this review draft until saving succeeds.');
  release();
  await expect(dialog.getByRole('alert')).toHaveText('Could not save the note.');
  await expect(notes).toHaveValue('Keep this review draft until saving succeeds.');
  fail = false;
  await dialog.getByRole('button', { name: 'Save notes', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(((await fixture.request(path)) as GeoActionDetail).action.notes).toBe(
    'Keep this review draft until saving succeeds.',
  );
  expect(paidPosts).toEqual([]);
});

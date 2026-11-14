import { expect, test, type Page } from '@playwright/test';
import { GeoFixtureWorkspace } from '../../src/client/pages/v2/geo-fixture';

async function workspace(page: Page) {
  const fixture = new GeoFixtureWorkspace();
  const mutations: string[] = [];
  await page.route('**/api/v2/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== 'GET') mutations.push(url.pathname);
    await route.fulfill({
      json: { data: await fixture.request(url.pathname.replace('/api/v2', '') + url.search) },
    });
  });
  return mutations;
}

test('an uncertain network result keeps the draft and a safe retry uses the same delivery key', async ({
  page,
}) => {
  await workspace(page);
  const attempts: Record<string, unknown>[] = [];
  await page.route('**/api/feedback', async (route) => {
    attempts.push(route.request().postDataJSON() as Record<string, unknown>);
    if (attempts.length === 1) await route.abort('failed');
    else await route.fulfill({ json: { data: { submitted: true } } });
  });
  await page.goto('/app/overview');
  await page.getByRole('button', { name: 'Send feedback', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Tell us what you think', exact: true });
  const message = dialog.getByRole('textbox', { name: 'Your message', exact: true });
  await message.fill('Please make the sources easier to review.');
  await dialog.getByRole('button', { name: 'Send feedback', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('couldn’t confirm');
  await expect(message).toHaveValue('Please make the sources easier to review.');
  await dialog.getByRole('button', { name: 'Send feedback', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Thanks for your feedback' })).toBeVisible();
  expect(attempts[0]).toEqual(attempts[1]);
});

test('feedback stays in the app, preserves failed drafts and deduplicates retries', async ({
  page,
}) => {
  const mutations = await workspace(page);
  const attempts: Record<string, unknown>[] = [];
  let release: () => void = () => {
    throw new Error('Feedback request did not start.');
  };
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/feedback', async (route) => {
    attempts.push(route.request().postDataJSON() as Record<string, unknown>);
    if (attempts.length === 1) {
      await pending;
      await route.fulfill({
        status: 503,
        json: {
          error: {
            code: 'FEEDBACK_UNAVAILABLE',
            message: 'Could not submit feedback. Please try again.',
          },
        },
      });
    } else await route.fulfill({ json: { data: { submitted: true } } });
  });
  await page.goto('/app/overview?days=30&token=synthetic-secret#private-anchor');
  const trigger = page.getByRole('button', { name: 'Send feedback', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Tell us what you think', exact: true });
  await expect(dialog).toHaveCSS('font-family', /Switzer/);
  await dialog.getByText('Bug', { exact: true }).click();
  await expect(dialog.getByRole('radio', { name: 'Bug', exact: true })).toBeChecked();
  const message = dialog.getByRole('textbox', { name: 'Your message', exact: true });
  const email = dialog.getByRole('textbox', { name: /Email/ });
  await message.fill('A source icon is missing from this saved answer.');
  await email.fill('reply@example.test');
  await dialog.getByRole('button', { name: 'Send feedback', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Sending…', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  expect(attempts).toHaveLength(1);
  release();
  await expect(dialog.getByRole('alert')).toContainText('Could not submit');
  await expect(message).toHaveValue('A source icon is missing from this saved answer.');
  await expect(email).toHaveValue('reply@example.test');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(message).toHaveValue('A source icon is missing from this saved answer.');
  await dialog.getByRole('button', { name: 'Send feedback', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Thanks for your feedback', exact: true }),
  ).toBeVisible();
  expect(attempts).toHaveLength(2);
  expect(attempts[0]).toEqual(attempts[1]);
  expect(attempts[0]).toMatchObject({
    kind: 'bug',
    email: 'reply@example.test',
    page: '/app/overview',
  });
  expect(JSON.stringify(attempts)).not.toContain('synthetic-secret');
  expect(JSON.stringify(attempts)).not.toContain('private-anchor');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(message).toHaveValue('');
  await expect(email).toHaveValue('');
  expect(page.context().pages()).toHaveLength(1);
  expect(mutations).toEqual([]);
});

test('feedback validates input, keeps optional email optional and starts a new key for edited content', async ({
  page,
}) => {
  await workspace(page);
  const attempts: Record<string, unknown>[] = [];
  await page.route('**/api/feedback', async (route) => {
    attempts.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill(
      attempts.length === 1
        ? {
            status: 429,
            json: {
              error: {
                code: 'FEEDBACK_RATE_LIMITED',
                message: 'Feedback limit reached. Please try again later.',
              },
            },
          }
        : { json: { data: { submitted: true } } },
    );
  });
  await page.goto('/app/settings');
  await page.getByRole('button', { name: 'Send feedback', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Tell us what you think', exact: true });
  const send = dialog.getByRole('button', { name: 'Send feedback', exact: true });
  await expect(send).toBeDisabled();
  await dialog.getByRole('radio', { name: 'Other', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(dialog.getByRole('radio', { name: 'Idea', exact: true })).toBeChecked();
  await dialog
    .getByRole('textbox', { name: 'Your message', exact: true })
    .fill('A useful idea for clearer answer sources.');
  const email = dialog.getByRole('textbox', { name: /Email/ });
  await email.fill('invalid');
  await send.click();
  expect(attempts).toHaveLength(0);
  await email.fill('');
  await send.click();
  await expect(dialog.getByRole('alert')).toContainText('limit reached');
  await dialog
    .getByRole('textbox', { name: 'Your message', exact: true })
    .fill('An edited idea for clearer answer sources.');
  await send.click();
  await expect(page.getByRole('dialog', { name: 'Thanks for your feedback' })).toBeVisible();
  expect(attempts[0]?.requestId).not.toBe(attempts[1]?.requestId);
  expect(attempts[1]).not.toHaveProperty('email');
});

test('feedback fits narrow screens and does not send from synthetic fixtures', async ({
  page,
}, testInfo) => {
  const requests: string[] = [];
  await page.route('**/api/**', async (route) => {
    requests.push(route.request().url());
    await route.abort();
  });
  await page.goto('/app/overview?fixture=1');
  await page.getByRole('button', { name: 'Send feedback', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Tell us what you think', exact: true });
  await dialog
    .getByRole('textbox', { name: 'Your message', exact: true })
    .fill('Synthetic preview feedback must not send real email.');
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 720 });
    if (width >= 640)
      await expect
        .poll(async () => (await dialog.boundingBox())?.width ?? Infinity)
        .toBeLessThanOrEqual(560);
    await expect(
      dialog.getByRole('button', { name: 'Send feedback', exact: true }),
    ).toBeInViewport();
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath(`feedback-${String(width)}.png`) });
  }
  await expect(
    dialog.getByText('Feedback is not sent from this synthetic workspace.'),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Send feedback', exact: true })).toBeDisabled();
  expect(requests).toEqual([]);
});

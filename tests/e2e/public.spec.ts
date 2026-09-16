import { expect, test } from '@playwright/test';

test('visitor can inspect landing page and public demo', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('who gets recommended');
  await page.getByRole('link', { name: /Explore the live demo/ }).click();
  await expect(page.getByText('Illustrative demo data').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'OrbitCal visibility' })).toBeVisible();
});

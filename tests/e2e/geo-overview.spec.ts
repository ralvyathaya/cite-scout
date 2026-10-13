import { expect, test } from '@playwright/test';
import { legacyGeoFixture } from './geo-legacy-fixtures';

const prompt = 'Which CRM works for a small marketing team?';
const at = '2026-10-10T10:00:00Z';
test.beforeEach(async ({ page }) => {
  await page.route('**/api/v2/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith('/api/v2/geo/')) {
      await route.fulfill({ json: { data: legacyGeoFixture(path, 'p') } });
      return;
    }
    const question = {
      id: 'q',
      text: prompt,
      enabled: true,
      archivedAt: null,
      updatedAt: at,
      replacesQuestionId: null,
    };
    const data = path.endsWith('/project')
      ? {
          project: {
            id: 'p',
            brandName: 'CedarFlow',
            canonicalDomain: 'cedarflow.example',
            contextVersion: 1,
            competitors: [],
            questions: [question],
          },
          enrolled: true,
          canScan: true,
          internalTestAccess: false,
          trial: null,
          scansEnabled: true,
          supportEmail: 'support@cite-scout.com',
          usage: {
            today: 10,
            month: 20,
            dailyLimit: 10,
            monthlyLimit: 350,
            resetAt: at,
            monthlyResetAt: at,
          },
        }
      : path.endsWith('/questions')
        ? {
            questions: [
              {
                ...question,
                latest: { id: 'answer', capturedAt: at, brandMatched: true, competitors: [] },
                latestAttempt: null,
                previousId: null,
                baselineId: null,
                delta: null,
                stale: false,
                contextChanged: false,
                needsAttention: false,
              },
            ],
            summary: {
              tracked: 1,
              available: 1,
              brandMatched: 1,
              comparable: 0,
              changed: 0,
              sourcesUnavailable: 0,
              from: at,
              to: at,
            },
          }
        : {
            observation: {
              id: 'answer',
              questionId: 'q',
              questionText: prompt,
              capturedAt: at,
              evidenceVersion: 'legacy',
              context: null,
              capture: null,
              legacyText: 'CedarFlow is mentioned in this original saved answer.',
              legacySources: [],
            },
            comparison: null,
            previousId: null,
            baselineId: null,
            delta: null,
            comparisonReason: null,
          };
    await route.fulfill({ json: { data } });
  });
});

test('workspace index exposes monitoring, quota reason and original proof', async ({
  page,
}, testInfo) => {
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'Visibility & action overview' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Monitor Prompts' })).toBeDisabled();
  await expect(page.getByText('Daily observation limit reached.')).toBeVisible();
  await expect(page.getByText(prompt, { exact: true }).last()).toBeVisible();
  await expect(
    page.getByText('CedarFlow is mentioned in this original saved answer.'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'View full answer & raw JSON' })).toHaveAttribute(
    'href',
    '/app/questions/q?observation=answer',
  );
  await page.screenshot({ path: testInfo.outputPath('overview.png'), fullPage: true });
});

test('mobile navigation traps focus and returns to its trigger', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app');
  const trigger = page.getByRole('button', { name: 'Open navigation' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog', { name: 'Workspace navigation' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'Prompt Sets' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(drawer).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await drawer.getByRole('link', { name: 'Prompt Sets' }).click();
  await expect(page).toHaveURL(/\/app\/questions$/);
  await expect(drawer).not.toBeVisible();
});

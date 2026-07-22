import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Axe-core scans for the adult-facing surfaces (issue #458): /privacy, /admin
// (both auth states), and the Parent Center dialog. The toddler-facing canvas
// chrome is deliberately out of scope — its UX rules (giant wordless buttons,
// no reading order) aren't WCAG's — so the Parent Center scan is scoped to the
// dialog itself rather than the whole drawing page.
//
// Only serious/critical violations fail the test, but the failure message
// reports every violation axe found so the full picture is one run away.

const ADMIN_KEY = 'test-admin-secret'; // set in playwright.config.ts webServer.env

async function expectNoSeriousViolations(page: Page, include?: string) {
  let builder = new AxeBuilder({ page });
  if (include) builder = builder.include(include);
  const { violations } = await builder.analyze();

  const report = violations
    .map(
      (v) =>
        `[${v.impact}] ${v.id}: ${v.help} (${v.helpUrl})\n` +
        v.nodes.map((n) => `  ${n.target.join(' ')}\n    ${n.failureSummary}`).join('\n')
    )
    .join('\n');

  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    serious.map((v) => v.id),
    `axe violations:\n${report}`
  ).toEqual([]);
}

test('/privacy has no serious accessibility violations', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('/admin logged out has no serious accessibility violations', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('/admin logged in has no serious accessibility violations', async ({ page }) => {
  await page.goto('/admin');
  await page.getByPlaceholder('Admin access key').fill(ADMIN_KEY);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByPlaceholder('Add a code…')).toBeVisible();

  // Populate an invite row so the token list UI is part of the scan.
  const token = `e2e-a11y-${Date.now()}`;
  await page.getByPlaceholder('Add a code…').fill(token);
  await page.getByRole('button', { name: 'Add code' }).click();
  await expect(page.getByText(token, { exact: true })).toBeVisible();

  await expectNoSeriousViolations(page);

  await page.getByRole('button', { name: `Remove ${token}` }).click();
  await expect(page.getByText(token, { exact: true })).toBeHidden();
});

test('the Parent Center has no serious accessibility violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#drawingCanvas')).toBeVisible();
  const modal = page.locator('#parentHelpModal');
  await expect(async () => {
    if (!(await modal.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: 'Parent Center' }).click({ timeout: 3000 });
    }
    await expect(modal).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 10_000 });

  await expectNoSeriousViolations(page, '#parentHelpModal');
});

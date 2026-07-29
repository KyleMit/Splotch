import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN_ACCESS_TOKEN } from './admin-helpers';
import { openParentCenter } from './helpers';

// Axe-core scans for the adult-facing surfaces (issue #458): /privacy,
// /android-beta, /admin (both auth states), and the Parent Center dialog. The
// toddler-facing canvas chrome is deliberately out of scope — its UX rules
// (giant wordless buttons, no reading order) aren't WCAG's — so the Parent
// Center scan is scoped to the dialog itself rather than the whole drawing page.
//
// Only serious/critical violations fail the test, but the failure message
// reports every violation axe found so the full picture is one run away.
//
// It also reports axe's `incomplete` results, which are checks axe could not
// decide and therefore never counts as violations. They are easy to mistake for
// a clean bill: a one-character text node ("1", "2") always lands there with
// "Element content is too short to determine if it is actual text content", so a
// page whose color decisions ride on short labels would scan green with no
// contrast checked at all. Anything that matters is asserted explicitly by the
// owning spec — see android-beta.spec.ts.

async function expectNoSeriousViolations(page: Page, include?: string) {
  let builder = new AxeBuilder({ page });
  if (include) builder = builder.include(include);
  const { violations, incomplete } = await builder.analyze();

  const describe = (results: typeof violations) =>
    results
      .map(
        (v) =>
          `[${v.impact}] ${v.id}: ${v.help} (${v.helpUrl})\n` +
          v.nodes.map((n) => `  ${n.target.join(' ')}\n    ${n.failureSummary}`).join('\n')
      )
      .join('\n');

  const report = `${describe(violations)}\n\nincomplete (undecided by axe, not failures):\n${describe(incomplete)}`;

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

test('/android-beta has no serious accessibility violations', async ({ page }) => {
  await page.goto('/android-beta');
  await expect(page.getByRole('heading', { name: 'Join the Android Beta' })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('/admin logged out has no serious accessibility violations', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('/admin logged in has no serious accessibility violations', async ({ page }) => {
  await page.goto('/admin');
  await page.getByPlaceholder('Admin access key').fill(ADMIN_ACCESS_TOKEN);
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
  await openParentCenter(page);

  await expectNoSeriousViolations(page, '#parentHelpModal');
});

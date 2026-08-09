import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { adminConsole, signInToAdmin } from './admin-helpers';
import { draw, gotoApp, openSettingsModal } from './helpers';
import { openParentalGate } from './flows-harness';

// Axe-core scans the adult-facing surfaces (issue #458): /privacy,
// /changelog, /android-beta, /feedback, /design, /admin (both auth states),
// and the Settings dialog.
// The toddler-facing canvas chrome is deliberately out of scope — its UX rules
// (giant wordless buttons, no reading order) aren't WCAG's — so the Settings scan
// is scoped to the dialog itself rather than the whole drawing page.
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

test('/changelog has no serious accessibility violations', async ({ page }) => {
  await page.goto('/changelog');
  await expect(page.getByRole('heading', { name: 'Changelog', level: 1 })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('/android-beta has no serious accessibility violations', async ({ page }) => {
  await page.goto('/android-beta');
  await expect(page.getByRole('heading', { name: 'Join the Android Beta' })).toBeVisible();
  // The heading is prerendered, so it is visible at first paint; step 4's
  // callout is composed after hydration and would otherwise race the scan.
  await expect(page.locator('.step-4 .card')).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('/feedback has no serious accessibility violations', async ({ page }) => {
  await page.goto('/feedback');
  await expect(page.getByRole('heading', { name: 'Send us feedback' })).toBeVisible();
  // Scan the device-info panel too — it is half the form's markup and is only
  // in the DOM once the parent opts in.
  await page.getByRole('checkbox').check();
  await expect(page.getByText('What will be sent?')).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('/design has no serious accessibility violations', async ({ page }) => {
  await page.goto('/design');
  await expect(page.getByRole('heading', { name: 'Splotch design system' })).toBeVisible();
  // The color chips stay in scope: chipInk.ts picks black/white by WCAG
  // contrast, so every on-fill label clears 4.5:1 (chipInk.test.ts holds the
  // exhaustive dual-theme proof; this scan is the rendered-page check).
  await expectNoSeriousViolations(page);
});

test('/admin logged out has no serious accessibility violations', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('/admin logged in has no serious accessibility violations', async ({ page }) => {
  await signInToAdmin(page);

  // Populate an invite row so the token list UI is part of the scan.
  const token = `e2e-a11y-${Date.now()}`;
  await adminConsole(page).fill(token);
  await page.getByRole('button', { name: 'Add code' }).click();
  await expect(page.getByText(token, { exact: true })).toBeVisible();

  await expectNoSeriousViolations(page);

  await page.getByRole('button', { name: `Remove ${token}` }).click();
  await expect(page.getByText(token, { exact: true })).toBeHidden();
});

test('Settings has no serious accessibility violations', async ({ page }) => {
  await gotoApp(page);
  await openSettingsModal(page);

  await expectNoSeriousViolations(page, '#settingsModal');
});

test('Parent Center has no serious accessibility violations', async ({ page }) => {
  await gotoApp(page);
  const settings = await openSettingsModal(page);
  await settings.getByRole('button', { name: 'Parent Center' }).click();
  await expect(settings.getByRole('heading', { name: 'Parent Center', exact: true })).toBeVisible();

  await expectNoSeriousViolations(page, '#settingsModal');
});

test('the parental gate has no serious accessibility violations', async ({ page }) => {
  // The access-code param reveals the AI button, the gate's opener.
  await gotoApp(page, '/?ai_access_token=test-token', { gateUnlocked: false });
  await draw(page, [
    { x: 120, y: 120 },
    { x: 260, y: 200 },
  ]);
  await openParentalGate(page);

  await expectNoSeriousViolations(page, '#parentalGate');
});

// Axe reports the dialog's color-contrast checks as incomplete (bgOverlap), so
// a failing brand fill sails through the scan above. This computes the ratio
// directly for the one selected-state fill the scan can't see.
function contrastRatio(fg: [number, number, number], bg: [number, number, number]) {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = ([r, g, b]: [number, number, number]) =>
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

function parseRgb(value: string): [number, number, number] {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) throw new Error(`not an rgb() color: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

test('the active Settings nav item holds WCAG AA contrast', async ({ page }) => {
  await gotoApp(page);
  await openSettingsModal(page);

  const active = page.locator('.settings-nav-item.active').first();
  await expect(active).toBeVisible();
  const { color, backgroundColor } = await active.evaluate((el) => {
    const style = getComputedStyle(el);
    return { color: style.color, backgroundColor: style.backgroundColor };
  });
  expect(contrastRatio(parseRgb(color), parseRgb(backgroundColor))).toBeGreaterThanOrEqual(4.5);
});

// The gate's operand digits are aria-hidden (the equation row's label carries
// the semantics), so axe never contrast-checks them — but they're visible text
// and must hold WCAG AA for large bold type (3:1) on their splat fills. The
// fills are unthemed crayon hues and the ink is fixed, so one theme covers
// both.
test('the parental gate operand digits hold WCAG AA large-text contrast', async ({ page }) => {
  // The access-code param reveals the AI button, the gate's opener.
  await gotoApp(page, '/?ai_access_token=test-token', { gateUnlocked: false });
  await draw(page, [
    { x: 120, y: 120 },
    { x: 260, y: 200 },
  ]);
  await openParentalGate(page);

  const operands = page.locator('.gate-operand');
  await expect(operands).toHaveCount(2);
  for (const operand of await operands.all()) {
    const { color, backgroundColor } = await operand.evaluate((el) => {
      const style = getComputedStyle(el);
      return { color: style.color, backgroundColor: style.backgroundColor };
    });
    expect(contrastRatio(parseRgb(color), parseRgb(backgroundColor))).toBeGreaterThanOrEqual(3);
  }
});

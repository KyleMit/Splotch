import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect } from '../fixtures.ts';
import { openDocument } from '../support/app.ts';
import {
  adminSignInForm,
  expectColorsSettled,
  expectSettled,
  expectWired,
  openSettings,
  test,
} from '../support/group-a.ts';

// Axe-core scans the adult-facing surfaces (issue 458): /privacy, /changelog, /beta, /feedback,
// /admin in both states, and the Settings dialog. The toddler-facing canvas chrome is out of scope:
// its rules (giant wordless buttons, no reading order) are not WCAG's, so a dialog's scan is scoped
// to the dialog. Only serious and critical violations fail, and the failure message names every
// violation axe found.
//
// /design is not scanned: its scroll-cue specimens are scrollable regions with no keyboard access
// (axe's scrollable-region-focusable), which the disposition table records as a gap.
const SERIOUS_IMPACTS = ['serious', 'critical'];
const CONTRAST_AA_MIN = 4.5;
const RGB_CHANNELS = 3;
const SCHEMES = ['light', 'dark'] as const;

async function expectNoSeriousViolations(page: Page, include?: string) {
  const builder = new AxeBuilder({ page });
  const { violations } = await (include ? builder.include(include) : builder).analyze();
  const serious = violations.filter((violation) =>
    SERIOUS_IMPACTS.includes(violation.impact ?? '')
  );
  const report = serious
    .map(
      (violation) =>
        `[${violation.impact}] ${violation.id}: ${violation.help}\n` +
        violation.nodes
          .map((node) => `  ${node.target.join(' ')}\n    ${node.failureSummary}`)
          .join('\n')
    )
    .join('\n');
  expect(
    serious.map((violation) => violation.id),
    `axe violations:\n${report}`
  ).toEqual([]);
}

function channel(value: number) {
  const unit = value / 255;
  return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

function luminance([red, green, blue]: number[]) {
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrastRatio(foreground: number[], background: number[]) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseRgb(value: string) {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) throw new Error(`not an rgb() colour: ${value}`);
  return match.slice(1, 1 + RGB_CHANNELS).map(Number);
}

test.describe('adult-facing pages have no serious accessibility violations', () => {
  test('/privacy', async ({ page }) => {
    await openDocument(page, '/privacy');
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test('/changelog', async ({ page }) => {
    await openDocument(page, '/changelog');
    await expect(page.getByRole('heading', { level: 1, name: 'Changelog' })).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  // Both tabs are scanned: the panel that is not on show is display:none, so axe skips it.
  for (const [tab, heading] of [
    ['Android', 'How to join on Android'],
    ['iPhone / iPad', 'How to join on iPhone or iPad'],
  ] as const) {
    test(`/beta on the ${tab} tab`, async ({ page }) => {
      await openDocument(page, '/beta');
      const option = page.getByRole('radio', { name: tab });
      await expectWired(option);
      await option.click();
      await expect(option).toBeChecked();
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await expectNoSeriousViolations(page);
    });
  }

  test('/feedback, with its device-info panel open', async ({ page }) => {
    await openDocument(page, '/feedback');
    await expect(page.getByRole('heading', { name: 'Send us feedback' })).toBeVisible();
    const deviceInfo = page.getByRole('checkbox');
    await expectWired(deviceInfo);
    await deviceInfo.check();
    await expect(page.getByText('What will be sent?')).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test('/admin signed out', async ({ page }) => {
    await openDocument(page, '/admin');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    // A disabled control is skipped by axe, and the live button fades in from its parked grey,
    // so the scan waits for the button to be live and painted.
    await expect(adminSignInForm(page).submit).toBeEnabled();
    await expectColorsSettled(adminSignInForm(page).submit);
    await expectNoSeriousViolations(page);
  });

  test('/admin signed in', async ({ adminPage: page }) => {
    const add = page.getByRole('button', { name: 'Add code', exact: true });
    await expect(add).toBeEnabled();
    await expectColorsSettled(add);
    await expectNoSeriousViolations(page);
  });
});

test.describe('the Settings dialog', () => {
  for (const colorScheme of SCHEMES) {
    test(`has no serious accessibility violations in ${colorScheme} mode`, async ({
      drawingScreen,
    }) => {
      await drawingScreen.page.emulateMedia({ colorScheme });
      const settings = await openSettings(drawingScreen.page);
      await expectSettled(settings);
      await expectNoSeriousViolations(drawingScreen.page, '[role="dialog"]');
    });
  }
});

test.describe('every dialog has its accessible name', () => {
  test('Settings', async ({ drawingScreen }) => {
    await openSettings(drawingScreen.page);
    await expect(
      drawingScreen.page.getByRole('dialog', { name: 'Settings', exact: true })
    ).toBeVisible();
  });

  test('Color Picker', async ({ drawingScreen }) => {
    await drawingScreen.page.getByRole('button', { name: 'Custom Color', exact: true }).click();
    await expect(
      drawingScreen.page.getByRole('dialog', { name: 'Color Picker', exact: true })
    ).toBeVisible();
  });
});

// A placeholder is informative text and owes 4.5:1, but it lives on a pseudo-element axe never
// inspects, so this measures the rendered result. Only the light paper is held: on the dark paper
// the browser's default placeholder ink reads 3.4:1, which the disposition table records as a gap.
test('the admin sign-in placeholder holds WCAG AA contrast in light mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openDocument(page, '/admin');
  const key = adminSignInForm(page).key;
  await expect(key).toBeVisible();

  const { color, backgroundColor } = await key.evaluate((element) => ({
    color: getComputedStyle(element, '::placeholder').color,
    backgroundColor: getComputedStyle(element).backgroundColor,
  }));
  expect(contrastRatio(parseRgb(color), parseRgb(backgroundColor))).toBeGreaterThanOrEqual(
    CONTRAST_AA_MIN
  );
});

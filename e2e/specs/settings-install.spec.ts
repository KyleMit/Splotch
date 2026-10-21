import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { openDrawingScreen } from '../support/drawing.ts';
import { ANDROID_UA, IPAD_UA, IPHONE_CHROME_UA, openSettings } from '../support/group-c.ts';

// The Install section shows the one checklist this device can act on: an iPad has no App Pinning to
// enable, and a laptop has neither. The device comes from the user agent the app's detection reads
// (install/installPolicy.ts), and the wide Settings shell stacks every section, so the section is in
// reach without drilling in.

// One disclosure opening, short enough that the retry loop around them gets several attempts.
const DISCLOSURE_STEP_MS = 1_000;

async function openInstallSection(page: Page): Promise<Locator> {
  await openSettings(page);
  const section = page.getByRole('region', { name: 'Install' });
  const disclosures = section.locator('button[aria-expanded]');
  await expect(async () => {
    for (const disclosure of await disclosures.all()) {
      if ((await disclosure.getAttribute('aria-expanded')) === 'true') continue;
      await disclosure.click({ timeout: DISCLOSURE_STEP_MS });
      await expect(disclosure).toHaveAttribute('aria-expanded', 'true', {
        timeout: DISCLOSURE_STEP_MS,
      });
    }
    await expect(section.locator('button[aria-expanded="false"]')).toHaveCount(0, {
      timeout: DISCLOSURE_STEP_MS,
    });
  }).toPass();
  return section;
}

function disclosureNames(section: Locator) {
  return section.locator('button[aria-expanded]');
}

test.describe('an iOS device', () => {
  test.use({ userAgent: IPAD_UA });

  test('is shown the iOS steps alone', async ({ page }) => {
    await openDrawingScreen(page);
    const section = await openInstallSection(page);

    await expect(section.getByRole('heading', { name: 'iOS' })).toBeVisible();
    await expect(section.getByRole('heading', { name: /^(Android|Desktop)$/ })).toHaveCount(0);
    await expect(disclosureNames(section)).toHaveText([/Install as App/, /Enable Guided Access/]);
    await expect(section).toContainText('Add to Home Screen');
    await expect(section).not.toContainText('Recent Apps');
    await expect(section).not.toContainText('Open this page in Safari');
  });
});

// An iPad in portrait is the case a phone-only "at the bottom" got wrong: Safari keeps its Share
// button in the toolbar on a tablet in either orientation.
test.describe('an iPad in portrait', () => {
  test.use({ userAgent: IPAD_UA, viewport: { width: 820, height: 1180 } });

  test('is sent to the Share button in the Safari toolbar', async ({ page }) => {
    await openDrawingScreen(page);
    const section = await openInstallSection(page);

    await expect(section.getByRole('listitem').first()).toHaveText(
      /^1\.\s*Tap the\s+Share button in the Safari toolbar$/
    );
  });
});

test.describe('an iOS device outside Safari', () => {
  test.use({ userAgent: IPHONE_CHROME_UA });

  test('is sent to Safari before the steps that describe it', async ({ page }) => {
    await openDrawingScreen(page);
    const section = await openInstallSection(page);

    await expect(section.getByRole('heading', { name: 'iOS' })).toBeVisible();
    await expect(section.getByRole('listitem').first()).toContainText('Open this page in Safari');
    await expect(section).toContainText('Add to Home Screen');
  });
});

test.describe('an Android device', () => {
  test.use({ userAgent: ANDROID_UA });

  test('is shown the Android steps alone', async ({ page }) => {
    await openDrawingScreen(page);
    const section = await openInstallSection(page);

    await expect(section.getByRole('heading', { name: 'Android' })).toBeVisible();
    await expect(section.getByRole('heading', { name: /^(iOS|Desktop)$/ })).toHaveCount(0);
    await expect(disclosureNames(section)).toHaveText([/Install as App/, /Enable App Pinning/]);
    await expect(section).toContainText('Recent Apps');
    await expect(section).not.toContainText('Add to Home Screen');
  });
});

test.describe('a desktop browser', () => {
  test('is shown desktop guidance instead of either mobile checklist', async ({ page }) => {
    await openDrawingScreen(page);
    const section = await openInstallSection(page);

    await expect(section.getByRole('heading', { name: 'Desktop' })).toBeVisible();
    await expect(disclosureNames(section)).toHaveText([/Install as App/, /Keep kids in the app/]);
    await expect(section).not.toContainText('Add to Home Screen');
    await expect(section).not.toContainText('Recent Apps');
    // Every instruction names something a desktop parent can reach: the address-bar affordance,
    // Safari's Add to Dock, and the browser's own full-screen command.
    await expect(section).toContainText('address bar');
    await expect(section).toContainText('Add to Dock');
    await expect(section).toContainText('F11');
  });
});

import { expect, test, type Page } from '@playwright/test';
import { ANDROID_UA, gotoApp, IPAD_UA, IPHONE_CHROME_UA, openSettingsModal } from './helpers';

// The Install section shows the one checklist this device can act on — an iPad
// has no App Pinning to enable, and a laptop has neither. Which one it is comes
// from the install module's own detection (installDeviceOs), reached here
// through the user agent it reads rather than through anything this spec
// re-sniffs. The desktop case rides the project's own agent, so all three
// arrive the same way.
//
// The wide shell mounts every section, so the section is in reach without
// navigating; `openSettingsModal` waits out that fill.
async function openSetupSection(page: Page) {
  await gotoApp(page);
  const modal = await openSettingsModal(page);
  return modal.locator('.settings-section[data-section="setup"]');
}

// One heading resolves only while a single OS section is rendered, so each of
// these assertions is also what pins "one checklist, not two".
test.describe('an iOS device', () => {
  test.use({ userAgent: IPAD_UA });

  test('is shown the iOS steps alone', async ({ page }) => {
    const setup = await openSetupSection(page);

    await expect(setup.locator('.os-heading')).toHaveText('iOS');
    await expect(setup.locator('.help-section summary')).toHaveText([
      /Install as App/,
      /Enable Guided Access/,
    ]);
    await expect(setup).toContainText('Add to Home Screen');
    await expect(setup).not.toContainText('Recent Apps');
    // Safari is the screen the steps describe, so they start at the Share button.
    await expect(setup).not.toContainText('Open this page in Safari');
  });
});

test.describe('an iOS device outside Safari', () => {
  test.use({ userAgent: IPHONE_CHROME_UA });

  test('is sent to Safari before the steps that describe it', async ({ page }) => {
    const setup = await openSetupSection(page);

    await expect(setup.locator('.os-heading')).toHaveText('iOS');
    await expect(setup.locator('.steps li').first()).toContainText('Open this page in Safari');
    await expect(setup).toContainText('Add to Home Screen');
  });
});

test.describe('an Android device', () => {
  test.use({ userAgent: ANDROID_UA });

  test('is shown the Android steps alone', async ({ page }) => {
    const setup = await openSetupSection(page);

    await expect(setup.locator('.os-heading')).toHaveText('Android');
    await expect(setup.locator('.help-section summary')).toHaveText([
      /Install as App/,
      /Enable App Pinning/,
    ]);
    await expect(setup).toContainText('Recent Apps');
    await expect(setup).not.toContainText('Add to Home Screen');
  });
});

test.describe('a desktop browser', () => {
  test('is shown desktop guidance instead of either mobile checklist', async ({ page }) => {
    const setup = await openSetupSection(page);

    await expect(setup.locator('.os-heading')).toHaveText('Desktop');
    await expect(setup.locator('.help-section summary')).toHaveText([
      /Install as App/,
      /Keep kids in the app/,
    ]);
    await expect(setup).not.toContainText('Add to Home Screen');
    await expect(setup).not.toContainText('Recent Apps');

    // Every desktop instruction names something a desktop parent can actually
    // reach: the Chromium address-bar affordance, Safari's Add to Dock, and the
    // browser's own full-screen command — Splotch's Fullscreen Toggle is Android
    // web only (fullscreenSupported() in state/fullscreen.svelte.ts), so the
    // section must never point at it.
    await expect(setup).toContainText('address bar');
    await expect(setup).toContainText('Add to Dock');
    await expect(setup).toContainText('F11');
  });
});

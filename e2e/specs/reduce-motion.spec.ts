import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { openDrawingScreen } from '../support/drawing.ts';
import { openSettings } from '../support/group-c.ts';

// Reduce Motion has two triggers: the Accessibility switch, and the operating system's preference,
// which the browser reports as prefers-reduced-motion. An explicit choice in the switch overrides
// the system, in either direction, and lasts across a reload. What each trigger does to a cue is
// pinned by the mounted tests of the cues themselves; this is the wiring from a real browser's
// preference and a real reload to the switch a parent sees.

async function reduceMotionSwitch(page: Page) {
  const settings = await openSettings(page);
  const toggle = settings
    .getByRole('region', { name: 'Accessibility' })
    .getByRole('switch', { name: 'Reduce Motion' });
  await expect(toggle).toBeVisible();
  return toggle;
}

test('the switch turns Reduce Motion on while the system has no preference, across a reload', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openDrawingScreen(page);
  const toggle = await reduceMotionSwitch(page);
  await expect(toggle).not.toBeChecked();

  await toggle.click();
  await expect(toggle).toBeChecked();

  await page.reload();
  await expect(await reduceMotionSwitch(page)).toBeChecked();
});

test('the system preference reads as on in the switch', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openDrawingScreen(page);

  await expect(await reduceMotionSwitch(page)).toBeChecked();
});

test('turning the switch off overrides a reduce-motion system, across a reload', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openDrawingScreen(page);
  const toggle = await reduceMotionSwitch(page);

  await toggle.click();
  await expect(toggle).not.toBeChecked();

  await page.reload();
  await expect(await reduceMotionSwitch(page)).not.toBeChecked();
});

test('a switch the parent never touched follows a live change of the system preference', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openDrawingScreen(page);
  const toggle = await reduceMotionSwitch(page);
  await expect(toggle).not.toBeChecked();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(toggle).toBeChecked();

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(toggle).not.toBeChecked();
});

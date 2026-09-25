import { expect, test, type Page } from '@playwright/test';

import { STORAGE_KEYS } from '../src/lib/storageKeys';
import { solveParentalGate } from './flows-harness';
import {
  gotoApp,
  openHubSection,
  openSettingsModal,
  seedCompletedSettingsActivitySessions,
} from './helpers';

// The phone Settings shell: a hub of section rows that drills into one section
// at a time, with an inline switch on the two rows worth flipping without
// leaving the list (ADR-0061 and its 2026-08 amendment). The wide shell's table
// of contents over one continuous pane lives in flows-settings.spec.ts.

test('Settings hub drills into a section and back (phone layout)', async ({ page }) => {
  await page.setViewportSize({ width: 460, height: 852 });
  await gotoApp(page);

  const modal = await openSettingsModal(page);
  // Below the breakpoint the hub renders instead of the sidebar.
  await expect(modal).not.toHaveClass(/wide/);
  await expect(page.locator('.hub-list')).toBeVisible();
  // Nothing is drilled in yet, so a section's own controls aren't mounted.
  await expect(page.locator('#toolDrawerToggle')).toHaveCount(0);

  // Tapping a row opens the full-page section.
  await page.getByRole('button', { name: 'Tool Drawer' }).click();
  await expect(page.locator('#toolDrawerToggle')).toBeVisible();
  await expect(page.locator('.hub-list')).toHaveCount(0);

  // The back arrow returns to the hub.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('.hub-list')).toBeVisible();
  await expect(page.locator('#toolDrawerToggle')).toHaveCount(0);
});

// Every phone-shell move unmounts the control that held focus, so each one
// proves focus lands on its replacement rather than falling to <body>.
test('drilling into a section focuses its heading, and Back refocuses its row', async ({
  page,
}) => {
  await page.setViewportSize({ width: 460, height: 852 });
  await gotoApp(page);
  const modal = await openSettingsModal(page);

  await openHubSection(page, 'controls', '#toolDrawerToggle');
  await expect(modal.getByRole('heading', { name: 'Tool Drawer' })).toBeFocused();

  await modal.getByRole('button', { name: 'Back' }).click();
  await expect(modal.locator('.hub-row[data-section="controls"]')).toBeFocused();
});

test('unlocking Parent Center focuses its heading once the challenge has closed', async ({
  page,
}) => {
  await page.setViewportSize({ width: 460, height: 852 });
  await gotoApp(page, '/', { gates: 'always' });
  const modal = await openSettingsModal(page);

  await expect(async () => {
    await modal.locator('.hub-row[data-section="parentCenter"]').click({ timeout: 1000 });
    await expect(page.locator('#parentalGate')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await solveParentalGate(page);

  await expect(page.locator('#parentalGate')).not.toBeVisible();
  const heading = modal.locator('.settings-header-sub h2');
  await expect(heading).toHaveText('Parent Center');
  await expect(heading).toBeFocused();
});

test('the sixth session reveals dots only for sections not read during the quiet period', async ({
  page,
}) => {
  await seedCompletedSettingsActivitySessions(page, 4);
  await openPhoneHub(page);

  const aiRow = page.locator('.hub-row[data-section="ai"]');
  const activityDot = aiRow.locator('.section-activity-dot');
  await expect(activityDot).not.toHaveClass(/unseen/);
  await expect(activityDot).toHaveCSS('opacity', '0');
  await expect(aiRow).not.toHaveAccessibleName(/new/);
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.settingsActivitySessionCount)
    )
    .toBe('5');

  await aiRow.click();
  await expect(page.getByRole('heading', { name: 'AI Art' })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const stored: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
        return (
          typeof stored === 'object' &&
          stored !== null &&
          'ai' in stored &&
          typeof stored.ai === 'string'
        );
      }, STORAGE_KEYS.parentSectionsSeen)
    )
    .toBe(true);

  await page.reload();
  await openSettingsModal(page);
  await expect(page.locator('.hub-list')).toBeVisible();
  const seenAiDot = page.locator('.hub-row[data-section="ai"] .section-activity-dot');
  const unreadControlsRow = page.locator('.hub-row[data-section="controls"]');
  await expect(seenAiDot).not.toHaveClass(/unseen/);
  await expect(unreadControlsRow.locator('.section-activity-dot')).toHaveClass(/unseen/);
  await expect(unreadControlsRow).toHaveAccessibleName(/Tool Drawer.*new/);
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.settingsActivitySessionCount)
    )
    .toBe('6');
});

async function openPhoneHub(page: Page) {
  await page.setViewportSize({ width: 460, height: 852 });
  await gotoApp(page);
  const modal = await openSettingsModal(page);
  await expect(page.locator('.hub-list')).toBeVisible();
  return modal;
}

// The hub answers its two most-flipped booleans in place, and every other row
// is a plain drill-in — so the trailing edge of a row reads one way (a switch,
// or nothing at all) rather than as switch-versus-chevron.
test('the hub carries inline switches only on the rows that lead it', async ({ page }) => {
  await openPhoneHub(page);

  const switches = page.locator('.hub-list [role="switch"]');
  await expect(switches).toHaveCount(2);
  await expect(page.locator('#hubNightToggle')).toBeVisible();
  await expect(page.locator('#hubSoundToggle')).toBeVisible();
  await expect(page.locator('.hub-list [data-icon="chevron-right"]')).toHaveCount(0);

  // Those two rows lead the list, and the first drill-in after them opens the
  // second group — the extra gap that splits "flip it here" from "go configure".
  const rows = page.locator('.hub-row');
  await expect(rows.nth(0)).toHaveAttribute('data-section', 'appearance');
  await expect(rows.nth(1)).toHaveAttribute('data-section', 'sound');
  await expect(page.locator('.hub-list li.group-break .hub-row')).toHaveAttribute(
    'data-section',
    'controls'
  );
});

test('a hub switch acts on its setting without leaving the list', async ({ page }) => {
  await openPhoneHub(page);

  const soundSwitch = page.locator('#hubSoundToggle');
  await expect(soundSwitch).toHaveAttribute('aria-checked', 'true');
  await soundSwitch.click();

  // The row stays where it is — the switch is not a drill-in — and the summary
  // above it reports the setting the switch just changed.
  await expect(soundSwitch).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('.hub-list')).toBeVisible();
  await expect(page.locator('.hub-row[data-section="sound"] .hub-subtitle')).toHaveText('Muted');

  // Drilling in shows the same setting: one boolean, two ways to reach it.
  await openHubSection(page, 'sound', '#soundToggle');
  await expect(page.locator('#soundToggle')).toHaveAttribute('aria-checked', 'false');
});

test('the Sound hub subtitle names a single enabled source and an empty mix', async ({ page }) => {
  await openPhoneHub(page);
  await openHubSection(page, 'sound', '#soundToggle');

  await page.locator('#deleteSoundToggle').click();
  await page.getByRole('button', { name: 'Back' }).click();
  const subtitle = page.locator('.hub-row[data-section="sound"] .hub-subtitle');
  await expect(subtitle).toHaveText('Volume 50% · drawing only');

  await openHubSection(page, 'sound', '#drawingSoundToggle');
  await page.locator('#drawingSoundToggle').click();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(subtitle).toHaveText('No sources');
});

test('AI Art reports its off state in the phone hub', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page);
  await openSettingsModal(page);

  await expect(page.locator('.hub-row[data-section="ai"] .hub-subtitle')).toHaveText('Turned off');
});

test('AI Art removes setup controls from the phone DOM until its master switch is on', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page);

  await openSettingsModal(page);
  const aiRow = page.locator('.hub-row[data-section="ai"]');
  await aiRow.click();

  const toggle = page.locator('#aiImageToggle');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByText('What turning this on does')).toBeVisible();
  await expect(page.locator('#aiKeyInput')).toHaveCount(0);
  await expect(page.locator('#aiCustomizationToggle')).toHaveCount(0);

  await toggle.click();
  await expect(page.locator('#aiKeyInput')).toBeVisible();
  await expect(page.locator('#aiCustomizationToggle')).toBeAttached();
  await expect(page.getByText('What turning this on does')).toHaveCount(0);
});

test('the phone AI Art card keeps its height while the master switch reveals setup', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page);

  const modal = await openSettingsModal(page);
  await page.locator('.hub-row[data-section="ai"]').click();
  const toggle = page.locator('#aiImageToggle');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  const offHeight = await modal.evaluate((element) => element.clientHeight);

  await toggle.click();
  await expect(page.locator('#aiKeyInput')).toBeVisible();
  const onHeight = await modal.evaluate((element) => element.clientHeight);
  expect(onHeight).toBe(offHeight);
});

// Night Mode is binary over the resolved theme, so the hub switch and the
// three-way picker inside Appearance have to agree about which way it is set.
test('the hub Night Mode switch themes the app and matches the Appearance picker', async ({
  page,
}) => {
  await openPhoneHub(page);

  const nightSwitch = page.locator('#hubNightToggle');
  await expect(nightSwitch).toHaveAttribute('aria-checked', 'false');
  await nightSwitch.click();

  await expect(nightSwitch).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  // The glyph in the thumb is what names the state on a switch with no label.
  await expect(nightSwitch.locator('[data-icon="theme-dark"]')).toHaveCount(1);

  await openHubSection(page, 'appearance', '#themeOption-dark');
  await expect(page.locator('#themeOption-dark')).toHaveAttribute('aria-checked', 'true');
});

// The track is deliberately 32px tall, under the 44px floor every interactive
// target holds to. In a ToggleRow the label beside the switch activates it too;
// on a hub row this button is the whole target on its side of the split, so it
// takes taps past its own box.
test('the hub switch answers a tap above its track', async ({ page }) => {
  await openPhoneHub(page);

  const nightSwitch = page.locator('#hubNightToggle');
  await expect(nightSwitch).toHaveAttribute('aria-checked', 'false');
  const box = (await nightSwitch.boundingBox())!;
  expect(box.height).toBeLessThan(44);

  // 4px above the visible track — inside the 44px hit box, outside the 32px one.
  await page.mouse.click(box.x + box.width / 2, box.y - 4);
  await expect(nightSwitch).toHaveAttribute('aria-checked', 'true');
});

// The section's switch hides every tool the row would count, so with it off the
// row names the switch rather than a count of flags the child cannot see.
test('the Tool Drawer row names the switch rather than a tool count while it is off', async ({
  page,
}) => {
  await openPhoneHub(page);

  const subtitle = page.locator('.hub-row[data-section="controls"] .hub-subtitle');
  await expect(subtitle).toHaveText('Pen, crayon, magic brush & more');

  await openHubSection(page, 'controls', '#toolDrawerToggle');
  await page.locator('#toolDrawerToggle').click();
  await expect(page.locator('#toolDrawerToggle')).toHaveAttribute('aria-checked', 'false');

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(subtitle).toHaveText('Tool drawer off');
});

// The camera button is a way of saving a drawing, so it is owned by Saving —
// like Coloring and AI Art own their own buttons — rather than sitting in the
// chip grid behind the tool drawer switch.
test('the camera button toggle lives in Saving, not the Tool Drawer', async ({ page }) => {
  await openPhoneHub(page);

  await openHubSection(page, 'controls', '#toolDrawerToggle');
  // The chip grid ships revealed, so its absent camera chip is an assertion
  // about this grid rather than about a collapsed section.
  await expect(page.locator('#toolDrawerToggle')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.control-chips')).toHaveCount(1);
  await expect(page.locator('#screenshotToggle')).toHaveCount(0);

  await page.getByRole('button', { name: 'Back' }).click();
  await openHubSection(page, 'saving', '#screenshotToggle');
  const cameraToggle = page.locator('#screenshotToggle');
  await expect(cameraToggle).toHaveAttribute('aria-checked', 'true');
  await cameraToggle.click();
  await expect(cameraToggle).toHaveAttribute('aria-checked', 'false');
});

import { expect, test, type Page } from '@playwright/test';

import { STORAGE_KEYS } from '../src/lib/storageKeys';
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
  await expect(page.locator('#advancedControlsToggle')).toHaveCount(0);

  // Tapping a row opens the full-page section.
  await page.getByRole('button', { name: 'Tool Drawer' }).click();
  await expect(page.locator('#advancedControlsToggle')).toBeVisible();
  await expect(page.locator('.hub-list')).toHaveCount(0);

  // The back arrow returns to the hub.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('.hub-list')).toBeVisible();
  await expect(page.locator('#advancedControlsToggle')).toHaveCount(0);
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

// Advanced Controls is the umbrella over every tool: with it off the drawer
// cannot be opened at all, so a per-tool count would describe a panel the child
// cannot see.
test('the Tool Drawer row reports the umbrella state rather than a tool count', async ({
  page,
}) => {
  await openPhoneHub(page);

  const subtitle = page.locator('.hub-row[data-section="controls"] .hub-subtitle');
  await expect(subtitle).toHaveText('Pen, crayon, magic brush & more');

  await openHubSection(page, 'controls', '#advancedControlsToggle');
  await page.locator('#advancedControlsToggle').click();
  await expect(page.locator('#advancedControlsToggle')).toHaveAttribute('aria-checked', 'false');

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(subtitle).toHaveText('All tools hidden');
});

// Every action button lives inside the drawer Advanced Controls gates, so this
// row cannot promise a button that setting is currently suppressing.
test('the camera row says when the tool drawer is holding its button back', async ({ page }) => {
  await openPhoneHub(page);

  await openHubSection(page, 'saving', '#screenshotToggle');
  const help = page.locator('#screenshotToggle-help');
  await expect(help).toHaveText('Shows the camera button in the tool drawer');

  await page.getByRole('button', { name: 'Back' }).click();
  await openHubSection(page, 'controls', '#advancedControlsToggle');
  await page.locator('#advancedControlsToggle').click();
  await expect(page.locator('#advancedControlsToggle')).toHaveAttribute('aria-checked', 'false');

  await page.getByRole('button', { name: 'Back' }).click();
  await openHubSection(page, 'saving', '#screenshotToggle');
  await expect(help).toHaveText('The tool drawer is off, so the camera button stays hidden');
});

// The camera button is a way of saving a drawing, so it is owned by Saving —
// like Coloring and AI Art own their own buttons — rather than sitting in the
// chip grid behind Advanced Controls.
test('the camera button toggle lives in Saving, not the Tool Drawer', async ({ page }) => {
  await openPhoneHub(page);

  await openHubSection(page, 'controls', '#advancedControlsToggle');
  // The chip grid ships revealed, so its absent camera chip is an assertion
  // about this grid rather than about a collapsed section.
  await expect(page.locator('#advancedControlsToggle')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.control-chips')).toHaveCount(1);
  await expect(page.locator('#screenshotToggle')).toHaveCount(0);

  await page.getByRole('button', { name: 'Back' }).click();
  await openHubSection(page, 'saving', '#screenshotToggle');
  const cameraToggle = page.locator('#screenshotToggle');
  await expect(cameraToggle).toHaveAttribute('aria-checked', 'true');
  await cameraToggle.click();
  await expect(cameraToggle).toHaveAttribute('aria-checked', 'false');
});

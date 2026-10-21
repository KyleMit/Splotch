import { expect, test } from '../fixtures.ts';
import {
  closeDialog,
  goToSettingsSection,
  inkDarknessInCentralBand,
  openDrawer,
  openSettings,
  undoButton,
  waitUntilSettled,
} from '../support/group-b.ts';
import type { Page } from '@playwright/test';

test.use({ colorScheme: 'light', viewport: { width: 1280, height: 720 } });

// How long a stroke that must add nothing gets to show it did: an idle past the ink's settling.
const SETTLE_AFTER_SECOND_PASS_MS = 500;
const PHONE_PORTRAIT_WITH_ROOM = { width: 460, height: 852 };
const PHONE_PORTRAIT = { width: 400, height: 740 };
const PHONE_LANDSCAPE = { width: 740, height: 360 };
const MAX_LANDSCAPE_MENU_HEIGHT_PX = 120;
// A second pass over a crayon stroke fills bare grain, so it must darken the stroke measurably; a
// pen's solid ink leaves nothing to fill, so a second pass leaves it where it was.
const CRAYON_BUILD_UP_MIN_GAIN = 1.05;
const PEN_SECOND_PASS_MAX_GAIN = 1.01;
const STROKE_ALONG_A_LINE = [
  { x: 0.25, y: 0.45 },
  { x: 0.75, y: 0.45 },
] as const;

type DrawingTool = 'Crayon' | 'Magic brush' | 'Eraser';

// Turns each named tool off in Settings' Tool Drawer, then returns to the drawing screen.
async function switchToolsOff(page: Page, tools: readonly DrawingTool[]) {
  const settings = await openSettings(page);
  await goToSettingsSection(settings, 'Tool Drawer');
  for (const tool of tools) {
    const toggle = settings.getByRole('group', { name: 'Drawing Tools' }).getByRole('button', {
      name: tool,
      exact: true,
    });
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  }
  await closeDialog(settings);
}

function brushMenu(page: Page) {
  return page.getByRole('group', { name: 'Brush Menu' });
}

async function openBrushMenu(page: Page) {
  await openDrawer(page);
  await page.getByRole('button', { name: 'Brushes', exact: true }).click();
  await expect(brushMenu(page)).toBeVisible();
}

test.describe('the brushes the Tool Drawer offers', () => {
  test('one optional brush becomes a direct button that toggles against Pen', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await switchToolsOff(page, ['Crayon', 'Magic brush']);
    await openDrawer(page);

    const eraser = page.getByRole('button', { name: 'Eraser', exact: true });
    await expect(eraser).toBeVisible();
    await expect(page.getByRole('button', { name: 'Brushes', exact: true })).toHaveCount(0);
    await expect(eraser).not.toHaveAttribute('aria-pressed', 'true');

    await eraser.click();
    await expect(eraser).toHaveAttribute('aria-pressed', 'true');
    await eraser.click();
    await expect(eraser).not.toHaveAttribute('aria-pressed', 'true');
  });

  test('the Brush menu lists Pen and only the optional brushes left switched on', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await switchToolsOff(page, ['Crayon']);
    await openBrushMenu(page);

    await expect(brushMenu(page).getByRole('button')).toHaveCount(3);
    await expect(brushMenu(page).getByRole('button', { name: 'Pen', exact: true })).toBeVisible();
    await expect(brushMenu(page).getByRole('button', { name: 'Magic brush' })).toBeVisible();
    await expect(brushMenu(page).getByRole('button', { name: 'Eraser' })).toBeVisible();
    await expect(brushMenu(page).getByRole('button', { name: 'Crayon' })).toHaveCount(0);
  });

  test('with no optional brush left the drawer has no brush control, and Undo stays', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await switchToolsOff(page, ['Crayon', 'Magic brush', 'Eraser']);
    await openDrawer(page);

    await expect(page.getByRole('button', { name: 'Brushes', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Eraser', exact: true })).toHaveCount(0);
    await expect(undoButton(page)).toBeVisible();
  });

  test('switching off the brush in hand puts Pen back in hand', async ({ drawingScreen }) => {
    const { page } = drawingScreen;
    await openBrushMenu(page);
    await brushMenu(page).getByRole('button', { name: 'Magic brush', exact: true }).click();
    await openBrushMenu(page);
    await expect(
      brushMenu(page).getByRole('button', { name: 'Magic brush', exact: true })
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Brushes', exact: true }).click();
    await expect(brushMenu(page)).toBeHidden();

    await switchToolsOff(page, ['Magic brush']);
    await openBrushMenu(page);

    await expect(brushMenu(page).getByRole('button', { name: 'Pen', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});

function strokeWidthMenu(page: Page) {
  return page.getByRole('group', { name: 'Stroke Width Menu' });
}

async function openStrokeWidthMenu(page: Page) {
  await openDrawer(page);
  await page.getByRole('button', { name: 'Stroke width', exact: true }).click();
  await expect(strokeWidthMenu(page)).toBeVisible();
}

test.describe('the Brush and Stroke width menus', () => {
  test('Escape closes a menu and hands focus back to the button that opened it', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await openBrushMenu(page);
    await brushMenu(page).getByRole('button', { name: 'Pen', exact: true }).focus();
    await page.keyboard.press('Escape');
    await expect(brushMenu(page)).toBeHidden();
    await expect(page.getByRole('button', { name: 'Brushes', exact: true })).toBeFocused();

    await openStrokeWidthMenu(page);
    await strokeWidthMenu(page).getByRole('button', { name: 'Size 3', exact: true }).focus();
    await page.keyboard.press('Escape');
    await expect(strokeWidthMenu(page)).toBeHidden();
    await expect(page.getByRole('button', { name: 'Stroke width', exact: true })).toBeFocused();
  });

  test('choosing Eraser again leaves it chosen rather than switching it off', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await openBrushMenu(page);
    await brushMenu(page).getByRole('button', { name: 'Eraser', exact: true }).click();
    await openBrushMenu(page);
    await brushMenu(page).getByRole('button', { name: 'Eraser', exact: true }).click();

    await openBrushMenu(page);
    await expect(
      brushMenu(page).getByRole('button', { name: 'Eraser', exact: true })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('the Stroke width menu clears the Settings button on a phone, and a size tap leaves Settings shut', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await page.setViewportSize(PHONE_PORTRAIT_WITH_ROOM);
    await openStrokeWidthMenu(page);
    await waitUntilSettled(strokeWidthMenu(page));

    const settingsButton = await page
      .getByRole('button', { name: 'Settings', exact: true })
      .boundingBox();
    const largest = await strokeWidthMenu(page)
      .getByRole('button', { name: 'Size 5', exact: true })
      .boundingBox();
    expect(settingsButton).not.toBeNull();
    expect(largest).not.toBeNull();
    const overlaps =
      (largest?.x ?? 0) < (settingsButton?.x ?? 0) + (settingsButton?.width ?? 0) &&
      (largest?.x ?? 0) + (largest?.width ?? 0) > (settingsButton?.x ?? 0) &&
      (largest?.y ?? 0) < (settingsButton?.y ?? 0) + (settingsButton?.height ?? 0) &&
      (largest?.y ?? 0) + (largest?.height ?? 0) > (settingsButton?.y ?? 0);
    expect(overlaps, 'the largest size sits over the Settings button').toBe(false);

    await strokeWidthMenu(page).getByRole('button', { name: 'Size 5', exact: true }).click();
    await expect(strokeWidthMenu(page)).toBeHidden();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toBeHidden();
  });

  test('the Stroke width menu stays on screen after the phone turns to landscape', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    await page.setViewportSize(PHONE_PORTRAIT);
    await openDrawer(page);

    await page.setViewportSize(PHONE_LANDSCAPE);
    await openStrokeWidthMenu(page);
    await waitUntilSettled(strokeWidthMenu(page));

    const menu = await strokeWidthMenu(page).boundingBox();
    expect(menu?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect((menu?.y ?? 0) + (menu?.height ?? 0)).toBeLessThanOrEqual(PHONE_LANDSCAPE.height);
    expect(menu?.height ?? Infinity).toBeLessThan(MAX_LANDSCAPE_MENU_HEIGHT_PX);
  });
});

test.describe('the texture each brush lays', () => {
  test('the crayon builds up as it is drawn over again', async ({ drawingScreen }) => {
    const { page } = drawingScreen;
    await drawingScreen.pickColor('Black');
    await openBrushMenu(page);
    await brushMenu(page).getByRole('button', { name: 'Crayon', exact: true }).click();

    await drawingScreen.drawStroke(STROKE_ALONG_A_LINE);
    await expect.poll(() => inkDarknessInCentralBand(page)).toBeGreaterThan(0);
    const firstPass = await inkDarknessInCentralBand(page);
    await drawingScreen.drawStroke(STROKE_ALONG_A_LINE);

    await expect
      .poll(async () => (await inkDarknessInCentralBand(page)) / firstPass)
      .toBeGreaterThan(CRAYON_BUILD_UP_MIN_GAIN);
  });

  test('the pen lays solid ink, so a second pass adds nothing', async ({ drawingScreen }) => {
    const { page } = drawingScreen;
    await drawingScreen.pickColor('Black');

    await drawingScreen.drawStroke(STROKE_ALONG_A_LINE);
    await expect.poll(() => inkDarknessInCentralBand(page)).toBeGreaterThan(0);
    const firstPass = await inkDarknessInCentralBand(page);
    await drawingScreen.drawStroke(STROKE_ALONG_A_LINE);

    await page.waitForTimeout(SETTLE_AFTER_SECOND_PASS_MS);
    expect((await inkDarknessInCentralBand(page)) / firstPass).toBeLessThan(
      PEN_SECOND_PASS_MAX_GAIN
    );
  });
});

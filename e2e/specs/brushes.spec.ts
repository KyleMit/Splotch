import { expect, test } from '../fixtures.ts';
import {
  closeDialog,
  goToSettingsSection,
  openDrawer,
  openSettings,
  undoButton,
} from '../support/group-b.ts';
import type { Page } from '@playwright/test';

test.use({ colorScheme: 'light', viewport: { width: 1280, height: 720 } });

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

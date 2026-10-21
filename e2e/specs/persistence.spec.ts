import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { waitForDrawingScreen } from '../support/app.ts';
import {
  closeDialog,
  goToSettingsSection,
  openDrawer,
  openSettings,
  undoButton,
} from '../support/group-b.ts';

test.use({ colorScheme: 'light', viewport: { width: 1280, height: 720 } });

async function reloadDrawingScreen(page: Page) {
  await page.reload();
  await waitForDrawingScreen(page);
}

async function pickBrush(page: Page, brush: string) {
  await openDrawer(page);
  await page.getByRole('button', { name: 'Brushes', exact: true }).click();
  await page
    .getByRole('group', { name: 'Brush Menu' })
    .getByRole('button', { name: brush })
    .click();
}

async function pickStrokeWidth(page: Page, label: string) {
  await openDrawer(page);
  await page.getByRole('button', { name: 'Stroke width', exact: true }).click();
  await page
    .getByRole('group', { name: 'Stroke Width Menu' })
    .getByRole('button', { name: label })
    .click();
}

async function selectedStrokeWidth(page: Page) {
  await openDrawer(page);
  await page.getByRole('button', { name: 'Stroke width', exact: true }).click();
  const menu = page.getByRole('group', { name: 'Stroke Width Menu' });
  await expect(menu).toBeVisible();
  const pressed = await menu.getByRole('button', { pressed: true }).getAttribute('aria-label');
  await page.getByRole('button', { name: 'Stroke width', exact: true }).click();
  return pressed;
}

test.describe('what the drawing screen remembers across a reload', () => {
  test('the brush last picked is the brush in hand again', async ({ drawingScreen }) => {
    const { page } = drawingScreen;
    await pickBrush(page, 'Crayon');

    await reloadDrawingScreen(page);
    await openDrawer(page);
    await page.getByRole('button', { name: 'Brushes', exact: true }).click();

    await expect(
      page.getByRole('group', { name: 'Brush Menu' }).getByRole('button', { name: 'Crayon' })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('Pen and Eraser keep their own stroke sizes', async ({ drawingScreen }) => {
    const { page } = drawingScreen;
    await pickStrokeWidth(page, 'Size 5');
    await pickBrush(page, 'Eraser');
    await pickStrokeWidth(page, 'Size 1');

    await reloadDrawingScreen(page);

    await expect.poll(() => selectedStrokeWidth(page)).toBe('Size 5');
    await pickBrush(page, 'Eraser');
    await expect.poll(() => selectedStrokeWidth(page)).toBe('Eraser size 1');
  });

  test('the drawer stays open once it has been opened', async ({ drawingScreen }) => {
    const { page } = drawingScreen;
    await expect(page.getByRole('button', { name: 'Expand controls' })).toBeVisible();
    await openDrawer(page);

    await reloadDrawingScreen(page);

    await expect(page.getByRole('button', { name: 'Collapse controls' })).toBeVisible();
    await expect(undoButton(page)).toBeVisible();
  });

  test('a tool switched off in Settings stays off', async ({ drawingScreen }) => {
    const { page } = drawingScreen;
    const settings = await openSettings(page);
    await goToSettingsSection(settings, 'Tool Drawer');
    await settings
      .getByRole('group', { name: 'Drawing Tools' })
      .getByRole('button', { name: 'Undo', exact: true })
      .click();
    await closeDialog(settings);

    await reloadDrawingScreen(page);
    await openDrawer(page);

    await expect(undoButton(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Stroke width', exact: true })).toBeVisible();
  });
});

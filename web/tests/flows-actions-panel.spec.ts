import { expect, test, type Page } from '@playwright/test';

import { gotoApp, openSettingsModal } from './helpers';

import { openBrushMenu, openDrawer, openStrokeMenu } from './flows-harness';

const STALLED_DRAWER_TRANSITION_DURATION = '100s';

// A flyout closing under a keyboard user's focus has to hand that focus back to
// the trigger: the focused option is about to be display:none, which drops focus
// on <body>. Both close paths that can fire from inside the menu get their own
// test — the two flyouts share one open-state slot but have separate triggers,
// so each is checked in both.
test('Escape closes an Actions Panel flyout and restores focus to its trigger', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);

  await openBrushMenu(page);
  await page.locator('#penBrushButton').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.brush-menu')).toBeHidden();
  await expect(page.locator('#brushButton')).toBeFocused();

  await openStrokeMenu(page);
  await page.locator('button[aria-label="Size 3"]').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.stroke-width-menu')).toBeHidden();
  await expect(page.locator('#strokeWidthButton')).toBeFocused();
});

test('a keyboard pick closes the flyout and restores focus to its trigger', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);

  await openBrushMenu(page);
  await page.locator('#crayonBrushButton').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.brush-menu')).toBeHidden();
  await expect(page.locator('#brushButton')).toBeFocused();

  await openStrokeMenu(page);
  await page.locator('button[aria-label="Size 1"], button[aria-label="Eraser size 1"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.stroke-width-menu')).toBeHidden();
  await expect(page.locator('#strokeWidthButton')).toBeFocused();
});

for (const rotationSignal of ['screen orientation', 'legacy window orientation'] as const) {
  test(`${rotationSignal} cancels an in-flight action drawer transition`, async ({ page }) => {
    await gotoApp(page);
    await openDrawer(page);
    await page.addStyleTag({
      content: `:root { --duration-fast: ${STALLED_DRAWER_TRANSITION_DURATION} !important; }`,
    });

    const panel = page.locator('.actions-panel');
    await page.getByRole('button', { name: 'Collapse controls' }).click();
    await expect(panel).toHaveAttribute('data-drawer-motion', '');

    await page.evaluate((signal) => {
      const event = new Event(signal === 'screen orientation' ? 'change' : 'orientationchange');
      if (signal === 'screen orientation') screen.orientation.dispatchEvent(event);
      else window.dispatchEvent(event);
    }, rotationSignal);
    await expect(panel).not.toHaveAttribute('data-drawer-motion', '');
  });
}

test('the drawer motion marker clears when a state change starts no transition', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);
  await page.addStyleTag({ content: '.actions-drawer { transition: none !important; }' });

  const panel = page.locator('.actions-panel');
  await page.getByRole('button', { name: 'Collapse controls' }).click();
  await expect(panel).not.toHaveAttribute('data-drawer-motion', '');
});

// The switch hides the drawer's own tools in place: the drawer neither closes
// nor animates, because the other sections' buttons are still in it.
test('switching the tool drawer off behind Settings leaves the open drawer where it is', async ({
  page,
}) => {
  await gotoApp(page);
  await openDrawer(page);
  await openSettingsModal(page);
  await page.addStyleTag({
    content: `:root { --duration-fast: ${STALLED_DRAWER_TRANSITION_DURATION} !important; }`,
  });

  const panel = page.locator('.actions-panel');
  await page.locator('#toolDrawerToggle').click();
  await expect(panel).toHaveAttribute('data-off-undo', '');
  await expect(panel).not.toHaveAttribute('data-off-coloring', '');
  await expect(panel).not.toHaveAttribute('data-drawer-motion', '');
  await expect(panel).toHaveAttribute('data-drawer-open', '');
});

// Tapping the trigger again is the third path that closes a flyout, and the
// only one whose focus handling a real Chromium click hides: the click focuses
// the trigger before the handler runs, so focus has already left the menu.
// Where activation does not focus the button — Safari's behavior, and the whole
// reason scribbleTap activates on pointerup (ADR-0038) — the app has to hand
// focus back itself. Focus can then be lost again before the trailing trusted
// click, which is the ordering this synthetic sequence keeps.
async function tapTriggerLikeSafari(page: Page, triggerId: string) {
  const panel = page.locator('.actions-panel');
  await expect(panel).toHaveAttribute('data-action-panel-live', '');
  await expect(panel).not.toHaveAttribute('data-drawer-motion', '');
  await page.locator(triggerId).evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const init = {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      bubbles: true,
      clientX: rect.x + rect.width / 2,
      clientY: rect.y + rect.height / 2,
    };
    node.dispatchEvent(new PointerEvent('pointerdown', init));
    window.dispatchEvent(new PointerEvent('pointerup', init));
    (node as HTMLElement).blur();
    node.dispatchEvent(new MouseEvent('click', { ...init, detail: 1 }));
  });
}

test('a trigger tap that opens a flyout focuses it for Escape restoration', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);

  await tapTriggerLikeSafari(page, '#brushButton');
  await expect(page.locator('.brush-menu')).toBeVisible();
  await expect(page.locator('#brushButton')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.brush-menu')).toBeHidden();
  await expect(page.locator('#brushButton')).toBeFocused();

  await tapTriggerLikeSafari(page, '#strokeWidthButton');
  await expect(page.locator('.stroke-width-menu')).toBeVisible();
  await expect(page.locator('#strokeWidthButton')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.stroke-width-menu')).toBeHidden();
  await expect(page.locator('#strokeWidthButton')).toBeFocused();
});

test('a second tap on the trigger closes the flyout and restores focus to it', async ({ page }) => {
  await gotoApp(page);
  await openDrawer(page);

  await openBrushMenu(page);
  await page.locator('#penBrushButton').focus();
  await tapTriggerLikeSafari(page, '#brushButton');
  await expect(page.locator('.brush-menu')).toBeHidden();
  await expect(page.locator('#brushButton')).toBeFocused();

  await openStrokeMenu(page);
  await page.locator('button[aria-label="Size 3"], button[aria-label="Eraser size 3"]').focus();
  await tapTriggerLikeSafari(page, '#strokeWidthButton');
  await expect(page.locator('.stroke-width-menu')).toBeHidden();
  await expect(page.locator('#strokeWidthButton')).toBeFocused();
});

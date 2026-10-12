import { expect, test } from '@playwright/test';

import { gotoApp } from './helpers';

// ── icons ────────────────────────────────────────────────────────────────--

// ActionsPanel tints monochrome icons through `.action-icon:not(.icon-color) svg`,
// so <Icon> must compose the caller's class with the `icon-color` opt-out it adds
// for COLOR_ICONS members — and add nothing to a mono icon. Asserted here rather
// than as a component unit test: the class lands in the DOM, and `data-icon`
// exposes the icon identity for exactly this.
test('an icon composes its caller class with the color-icon tint opt-out', async ({ page }) => {
  await gotoApp(page);

  // camera is a spot icon: caller class plus the opt-out tag.
  const spot = page.locator('#screenshotButton [data-icon="camera"]');
  await expect(spot).toHaveClass(/(^|\s)action-icon(\s|$)/);
  await expect(spot).toHaveClass(/(^|\s)icon-color(\s|$)/);

  // The drawer chevron is monochrome and passes two caller classes through, so
  // it also catches a composition that drops or fuses class tokens.
  const mono = page.locator('.drawer-toggle [data-icon="chevron-right"]');
  await expect(mono).toHaveClass(/(^|\s)drawer-toggle-icon(\s|$)/);
  await expect(mono).toHaveClass(/(^|\s)corner-button-icon(\s|$)/);
  await expect(mono).not.toHaveClass(/icon-color/);
});

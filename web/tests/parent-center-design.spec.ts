import { expect, test } from '@playwright/test';
import { gotoApp, openSettingsModal } from './helpers';

const POLICY_COUNT = 5;
// The track is 180px wide with a 4px inset on every side.
const TRACK_WIDTH_PX = 180;
const TRACK_INSET_PX = 4;
// Chromium lays out in 1/64px units, so three flexed options sharing the
// track's inner run cannot all end on whole pixels: the last option's edge can
// sit one layout unit past or short of the inset, in either environment,
// depending on how the fractional remainder is dealt out. That is invisible;
// a selection that actually escapes its track is a whole pixel or more out.
const LAYOUT_UNIT_PX = 1 / 64;

test('every matrix selection nests inside its track on a portrait tablet', async ({ page }) => {
  await page.setViewportSize({ width: 1032, height: 1376 });
  await page.emulateMedia({ colorScheme: 'light' });
  await gotoApp(page);
  const settings = await openSettingsModal(page);
  await settings.locator('button[data-section="parentCenter"]').click();
  await expect(settings.locator('.policy-header')).toBeVisible();
  const tracks = settings.locator('.policy-picker');
  await expect(tracks).toHaveCount(POLICY_COUNT);
  const insets = await tracks.evaluateAll((nodes) =>
    nodes.map((track) => {
      const outer = track.getBoundingClientRect();
      const options = [...track.querySelectorAll('.option')].map((option) =>
        option.getBoundingClientRect()
      );
      return {
        width: outer.width,
        left: options[0].left - outer.left,
        right: outer.right - options.at(-1)!.right,
        top: options[0].top - outer.top,
        bottom: outer.bottom - options[0].bottom,
      };
    })
  );
  expect(insets).toHaveLength(POLICY_COUNT);
  for (const inset of insets) {
    expect(inset.width).toBe(TRACK_WIDTH_PX);
    for (const side of ['left', 'right', 'top', 'bottom'] as const) {
      expect(Math.abs(inset[side] - TRACK_INSET_PX), `${side} inset`).toBeLessThanOrEqual(
        LAYOUT_UNIT_PX
      );
    }
  }
});

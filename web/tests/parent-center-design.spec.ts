import { expect, test } from '@playwright/test';
import { gotoApp, openSettingsModal } from './helpers';

const POLICY_COUNT = 5;

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
  expect(insets).toEqual(
    Array.from({ length: POLICY_COUNT }, () => ({
      width: 180,
      left: 4,
      right: 4,
      top: 4,
      bottom: 4,
    }))
  );
});

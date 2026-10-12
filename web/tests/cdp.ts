import type { Page } from '@playwright/test';

export async function rotateViewportViaCdp(
  page: Page,
  { width, height, angle }: { width: number; height: number; angle: number }
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: true,
    screenOrientation: { type: 'portraitPrimary', angle },
  });
}

export interface SafeAreaInsetOverride {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Overrides env(safe-area-inset-*) for real — the only inset emulation Chromium
 * offers, and the only reason a notched layout can be asserted in CI at all.
 * DevTools' device presets leave every inset at zero.
 *
 * Every one of the eight keys is sent on every call, deliberately. The protocol
 * documents that "unset values will cause the respective variables to be
 * undefined, even if previously overridden" — so omitting `left` does not leave
 * it alone, it un-defines it, and a spec that passed only top and bottom would
 * be asserting a layout no device produces.
 *
 * The *Max keys back env(safe-area-max-inset-*), the stable maximum Chrome
 * exposes for insets that move (Android's retracting gesture chin). Nothing
 * moves under emulation, so they mirror the base values.
 *
 * The protocol types every inset as an integer and rejects the whole call with
 * "Invalid parameters" on a fractional one — but real devices report fractions
 * (a Galaxy S23 Ultra's 28.571 top, a Pixel 6 Pro's 41.43), because the value is
 * a dp measurement divided by a non-integer display density. So this rounds, and
 * RETURNS what it applied: a caller asserting against its own input would be
 * asserting a value the browser never saw.
 */
export async function overrideSafeAreaInsets(
  page: Page,
  insets: SafeAreaInsetOverride
): Promise<SafeAreaInsetOverride> {
  const applied = {
    top: Math.round(insets.top),
    right: Math.round(insets.right),
    bottom: Math.round(insets.bottom),
    left: Math.round(insets.left),
  };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send(
    'Emulation.setSafeAreaInsetsOverride' as never,
    {
      insets: {
        top: applied.top,
        topMax: applied.top,
        right: applied.right,
        rightMax: applied.right,
        bottom: applied.bottom,
        bottomMax: applied.bottom,
        left: applied.left,
        leftMax: applied.left,
      },
    } as never
  );
  return applied;
}

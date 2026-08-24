import { expect, test, type Page } from '@playwright/test';
import { overrideSafeAreaInsets } from './cdp';
import { DEVICE_PROFILES } from '../src/routes/dev/notch/lib/devices';
import { supportedOrientations } from '../src/routes/dev/notch/lib/deviceProfile';
import { isLandscape, type Orientation } from '../src/routes/dev/notch/lib/orientations';
import type { DeviceProfile } from '../src/routes/dev/notch/lib/deviceProfile';

// The whole device matrix, driven through the one seam that emulates real
// safe-area insets: CDP's Emulation.setSafeAreaInsetsOverride. Chromium only —
// there is no WebKit or Firefox equivalent, and DevTools' device presets report
// every inset as zero — so this spec is the only automated place the app is
// exercised as anything other than a rectangle.
//
// The /dev/notch harness renders the same matrix for a human to look at; this
// asserts the parts a human should not have to check tile by tile. Both read
// one dataset, so a device added there is covered here on the next run.

// The Clear Button hangs deliberately off the right edge (a circle the child
// pushes rather than a button they aim at), so a box-containment rule would
// fail on intended design. The rule that survives is about the target: the
// point a tap lands on has to be inside the claimable region.
const HUD_CONTROLS = [
  { name: 'color palette', selector: '.color-palette' },
  { name: 'clear button', selector: '.clear-button' },
  { name: 'settings button', selector: '.settings-button' },
  { name: 'actions panel', selector: '.actions-panel' },
] as const;

async function applyScenario(page: Page, profile: DeviceProfile, orientation: Orientation) {
  const insets = profile.insets[orientation];
  if (!insets) throw new Error(`${profile.id} does not offer ${orientation}`);
  const landscape = isLandscape(orientation);
  await page.setViewportSize({
    width: landscape ? profile.viewport.height : profile.viewport.width,
    height: landscape ? profile.viewport.width : profile.viewport.height,
  });
  // The applied values, not the researched ones: CDP rounds fractional insets
  // (see overrideSafeAreaInsets), so this is what the page will actually report.
  const applied = await overrideSafeAreaInsets(page, insets);
  await page.goto('/');
  await expect(page.locator('.color-palette')).toBeVisible();
  return applied;
}

/** What CSS actually resolved for both halves of the inset seam. */
async function resolvedInsets(page: Page) {
  return page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden';
    document.body.appendChild(probe);
    const read = (expression: string) => {
      probe.style.width = expression;
      const value = Number.parseFloat(getComputedStyle(probe).width);
      return Number.isFinite(value) ? value : Number.NaN;
    };
    const edges = ['top', 'right', 'bottom', 'left'] as const;
    const env = Object.fromEntries(
      edges.map((edge) => [edge, read(`env(safe-area-inset-${edge})`)])
    );
    const property = Object.fromEntries(
      edges.map((edge) => [edge, read(`var(--safe-area-${edge})`)])
    );
    probe.remove();
    return { env, property };
  });
}

const SCENARIOS = DEVICE_PROFILES.flatMap((profile) =>
  supportedOrientations(profile).map((orientation) => ({ profile, orientation }))
);

test.describe('safe-area matrix', () => {
  for (const { profile, orientation } of SCENARIOS) {
    test(`${profile.id} · ${orientation}`, async ({ page }) => {
      const insets = await applyScenario(page, profile, orientation);

      // 1. The override landed, and the custom-property seam agrees with env().
      //
      // This is the runtime half of safeAreaProperties.test.ts: that one proves
      // no source calls env() directly, this one proves the properties those
      // sources read actually carry env()'s value. Between them, an inset that
      // stops reaching the app has nowhere to hide.
      const resolved = await resolvedInsets(page);
      for (const edge of ['top', 'right', 'bottom', 'left'] as const) {
        expect(resolved.env[edge], `env(safe-area-inset-${edge})`).toBeCloseTo(insets[edge], 0);
        expect(resolved.property[edge], `var(--safe-area-${edge})`).toBeCloseTo(insets[edge], 0);
      }

      // 2. Every HUD control's tap target sits inside the claimable region.
      const viewport = page.viewportSize();
      if (!viewport) throw new Error('no viewport');
      const safe = {
        left: insets.left,
        top: insets.top,
        right: viewport.width - insets.right,
        bottom: viewport.height - insets.bottom,
      };

      for (const control of HUD_CONTROLS) {
        const box = await page.locator(control.selector).first().boundingBox();
        if (!box) continue;
        const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        expect(center.x, `${control.name} centre x`).toBeGreaterThanOrEqual(safe.left);
        expect(center.x, `${control.name} centre x`).toBeLessThanOrEqual(safe.right);
        expect(center.y, `${control.name} centre y`).toBeGreaterThanOrEqual(safe.top);
        expect(center.y, `${control.name} centre y`).toBeLessThanOrEqual(safe.bottom);
      }

      // 3. Insets shrink the usable box; they must never make the page scroll.
      const overflow = await page.evaluate(() => ({
        x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      }));
      expect(overflow.x, 'horizontal overflow').toBeLessThanOrEqual(0);
      expect(overflow.y, 'vertical overflow').toBeLessThanOrEqual(0);

      // 4. A painted band covers its edge's inset exactly — no more, so it never
      // eats claimable screen, and no less, so no unpainted sliver shows.
      for (const edge of ['top', 'left', 'right'] as const) {
        const band = page.locator(`.notch-band--${edge}`);
        const painted = await band.evaluate(
          (element) => getComputedStyle(element).backgroundColor !== 'rgba(0, 0, 0, 0)'
        );
        if (!painted) continue;
        const box = await band.boundingBox();
        const extent = edge === 'top' ? box?.height : box?.width;
        expect(extent, `${edge} band extent`).toBeCloseTo(insets[edge], 0);
      }
    });
  }
});

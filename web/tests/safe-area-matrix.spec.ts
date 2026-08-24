import { expect, test, type Page } from '@playwright/test';
import { overrideSafeAreaInsets } from './cdp';
import { DEVICE_PROFILES } from '../src/routes/dev/notch/lib/devices';
import { supportedOrientations } from '../src/routes/dev/notch/lib/deviceProfile';
import {
  ORIENTATION_ANGLES,
  isLandscape,
  type Orientation,
} from '../src/routes/dev/notch/lib/orientations';
import { appliedInsets, diagnose } from '../src/routes/dev/notch/lib/diagnostics';
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
//
// Every control here is REQUIRED to be present. An earlier version skipped a
// control whose bounding box came back null, which quietly turned "this control
// is outside the safe area" and "this control no longer renders" into the same
// green result — the second being the worse regression of the two.
const HUD_CONTROLS = [
  { name: 'color palette', selector: '.color-palette' },
  { name: 'clear button', selector: '.clear-button' },
  { name: 'settings button', selector: '.settings-button' },
  { name: 'actions panel', selector: '.actions-panel' },
] as const;

// The Fullscreen Toggle is the one HUD control that is conditionally present:
// fullscreen.svelte.ts surfaces it only in an Android *browser* tab, because
// that is the only place with a URL bar worth reclaiming. So it gets an
// expectation either way rather than being left out of the sweep — absent is a
// valid state, absent everywhere is not.
const FULLSCREEN_TOGGLE = '.fullscreen-toggle';
const ANDROID_BROWSER_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36';

function expectsFullscreenToggle(profile: DeviceProfile): boolean {
  return profile.platform === 'android' && profile.surface === 'browser';
}

async function applyScenario(page: Page, profile: DeviceProfile, orientation: Orientation) {
  // The insets the app lays out against, not the raw device numbers: on Android
  // native in landscape the app hides the status bar and the inset goes with it.
  const insets = appliedInsets(profile, orientation);
  if (!insets) throw new Error(`${profile.id} does not offer ${orientation}`);
  const landscape = isLandscape(orientation);
  const width = landscape ? profile.viewport.height : profile.viewport.width;
  const height = landscape ? profile.viewport.width : profile.viewport.height;

  // Device metrics rather than setViewportSize, because the scenario needs the
  // screen ORIENTATION too: the Notch Band reads screen.orientation.angle to
  // tell the two landscape rotations apart on a device whose insets cannot, and
  // a plain viewport resize leaves that at 0. This is the production path — the
  // spec sets the angle the OS would report and the app reads it back itself.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: true,
    screenOrientation: {
      type: landscape ? 'landscapePrimary' : 'portraitPrimary',
      angle: ORIENTATION_ANGLES[orientation],
    },
  });

  // fullscreen.svelte.ts gates the toggle on isAndroidBrowser(), which reads
  // navigator.userAgent — so an Android web profile has to actually present as
  // one or the control it is supposed to exercise never renders. Overridden
  // before goto(), since the store seeds `supported` at module load.
  if (expectsFullscreenToggle(profile)) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setUserAgentOverride', { userAgent: ANDROID_BROWSER_UA });
  }
  // The applied values, not the researched ones: CDP rounds fractional insets
  // (see overrideSafeAreaInsets), so this is what the page will actually report.
  const applied = await overrideSafeAreaInsets(page, insets);
  await page.goto('/');

  // Wait for the hydrated layout, not the prerendered one. The palette is
  // server-rendered and visible immediately, but the Notch Band is painted by an
  // effect reading the measured insets and the action buttons only take their
  // measured size cap at hydration — both land roughly half a second later.
  // Sampling before that reads a DOM with no band and pre-hydration geometry,
  // which is how the first version of this spec managed to skip every band it
  // was supposed to be checking. ACTION_PANEL_LIVE_ATTRIBUTE is the marker the
  // app already sets for exactly this question (actions-panel-layout.spec.ts).
  // The literal, not the constant: importing it from actionButtonLayout drags
  // the settings and network stores — and with them `$app` — into a spec that
  // Node has to resolve. Every other spec in this directory spells it the same
  // way for the same reason.
  await expect(page.locator('.actions-panel')).toHaveAttribute('data-action-panel-live', '');
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
      const viewport = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      }));
      const safe = {
        left: insets.left,
        top: insets.top,
        right: viewport.width - insets.right,
        bottom: viewport.height - insets.bottom,
      };

      const expectInsideSafeArea = async (name: string, selector: string) => {
        const locator = page.locator(selector).first();
        await expect(locator, `${name} is missing`).toBeVisible();
        const box = await locator.boundingBox();
        expect(box, `${name} has no box`).not.toBeNull();
        if (!box) return;
        const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        expect(center.x, `${name} centre x`).toBeGreaterThanOrEqual(safe.left);
        expect(center.x, `${name} centre x`).toBeLessThanOrEqual(safe.right);
        expect(center.y, `${name} centre y`).toBeGreaterThanOrEqual(safe.top);
        expect(center.y, `${name} centre y`).toBeLessThanOrEqual(safe.bottom);
      };

      // The toggle's presence is asserted either way; its position is only
      // checked where it should exist. Built as a list rather than an if/else so
      // every expect below stays unconditional.
      const expectsToggle = expectsFullscreenToggle(profile);
      await expect(page.locator(FULLSCREEN_TOGGLE)).toHaveCount(expectsToggle ? 1 : 0);
      const controls = expectsToggle
        ? [...HUD_CONTROLS, { name: 'fullscreen toggle', selector: FULLSCREEN_TOGGLE }]
        : HUD_CONTROLS;

      for (const control of controls) {
        await expectInsideSafeArea(control.name, control.selector);
      }

      // 3. Insets shrink the usable box; they must never make the page scroll.
      const overflow = await page.evaluate(() => ({
        x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      }));
      expect(overflow.x, 'horizontal overflow').toBeLessThanOrEqual(0);
      expect(overflow.y, 'vertical overflow').toBeLessThanOrEqual(0);

      // 4. Exactly the edge the app's own rule selects is painted, and it covers
      // that edge's inset exactly — no more, so it never eats claimable screen,
      // and no less, so no unpainted sliver shows.
      //
      // Asserting the painted SET, not just the painted ones, is the point: an
      // earlier version skipped every transparent band, so a device whose real
      // cutout goes unpainted (the Samsung punch, under the 30px threshold)
      // passed without the suite ever saying so. Where the app and the hardware
      // disagree, bandVerdict names the cause and devices.test.ts requires it.
      const expectedBandEdges = diagnose(profile, orientation)?.bandEdges ?? [];
      for (const edge of ['top', 'left', 'right'] as const) {
        const painted = await page
          .locator(`.notch-band--${edge}`)
          .evaluate((element) => getComputedStyle(element).backgroundColor !== 'rgba(0, 0, 0, 0)');
        expect(painted, `${edge} band painted`).toBe(expectedBandEdges.includes(edge));
      }

      // Extent only for the edges that should be painted — iterating the
      // expected set rather than branching on what was observed, so the
      // assertions stay unconditional.
      for (const edge of expectedBandEdges) {
        const box = await page.locator(`.notch-band--${edge}`).boundingBox();
        const extent = edge === 'top' ? box?.height : box?.width;
        expect(extent, `${edge} band extent`).toBeCloseTo(insets[edge], 0);
      }
    });
  }
});

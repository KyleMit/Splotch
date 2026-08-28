import { expect, type JSHandle, type Locator, type Page } from '@playwright/test';

import { COLOR_FAMILIES } from '../src/lib/hexPickerLayout';
import { compositeVisibleLiveTiles } from '../src/lib/drawing/liveTileComposite';
import { COLOR_CHANGE_DEBOUNCE_MS, POINTER_RESUME_JUMP_RATIO } from '../src/lib/drawing/strokeMath';
import { paletteHex } from '../src/lib/palette';
import { SECURITY_HEADERS } from '../src/lib/server/securityHeaders';
import { STORAGE_KEYS } from '../src/lib/storageKeys';
import type { HistoryDebug } from '../src/lib/drawing/undoHistory';

// Shared E2E helpers used across specs. Keep this module cross-engine portable — no
// CDP sessions or dev-harness routes — because engine-smoke.spec.ts imports it
// (see web/tests/CLAUDE.md).

// User agents for the specs that exercise the app's OS detection (isIosDevice /
// isAndroidBrowser, behind installDeviceOs). A spec picks one with `test.use`;
// the project's own desktop agent covers the third case.
export const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36';
export const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
// Chrome on iOS — an iOS device whose Share sheet is not the one the manual
// install steps describe (the CriOS token is what marks it).
export const IPHONE_CHROME_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124 Mobile/15E148 Safari/604.1';

// Looked up rather than copied, so a retuned hue can't leave a spec clicking a
// selector that matches nothing (the swatch carries its hex as data-color).
export const TEST_PALETTE = {
  purple: paletteHex('Purple'),
  indigo: paletteHex('Indigo'),
  blue: paletteHex('Blue'),
  teal: paletteHex('Teal'),
  mint: paletteHex('Mint'),
  green: paletteHex('Green'),
  lime: paletteHex('Lime'),
  yellow: paletteHex('Yellow'),
  orange: paletteHex('Orange'),
  brown: paletteHex('Brown'),
  red: paletteHex('Red'),
  pink: paletteHex('Pink'),
  magenta: paletteHex('Magenta'),
  grey: paletteHex('Grey'),
  black: paletteHex('Black'),
};

export const PICKER_GREEN = COLOR_FAMILIES.find((family) => family.name === 'greens')!.shades[4];
export const CUSTOM_SWATCH_COLOR = 'custom';

export type Rgba = readonly [number, number, number, number];

export const COLOR_CHANGE_DEBOUNCE_SETTLE_MS = COLOR_CHANGE_DEBOUNCE_MS + 50;

export function renderedText(locator: Locator): Promise<string> {
  return locator.evaluate((element) =>
    (element as HTMLElement).innerText.replace(/\s+/g, ' ').trim()
  );
}

export function swatch(page: Page, color: string) {
  return page.locator(`button.color-swatch[data-color="${color}"]`);
}

export function touchEventPrevented(
  page: Page,
  selector: string,
  type: 'touchstart' | 'touchmove',
  stylus = false
): Promise<boolean> {
  return page.evaluate(
    ({ selector, type, stylus }) => {
      const target = document.querySelector(selector) as HTMLElement;
      if (stylus) {
        const event = new Event(type, { cancelable: true, bubbles: true });
        Object.defineProperty(event, 'changedTouches', { value: [{ touchType: 'stylus' }] });
        target.dispatchEvent(event);
        return event.defaultPrevented;
      }

      const touch = new Touch({ identifier: 1, target, clientX: 10, clientY: 10 });
      const event = new TouchEvent(type, {
        touches: [touch],
        changedTouches: [touch],
        cancelable: true,
        bubbles: true,
      });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    },
    { selector, type, stylus }
  );
}

/** Stamp the platform half of the shipped CSP onto document responses.
 *
 *  SvelteKit's hash-bearing meta tag already enforces the resource policy in
 *  `vite preview`; only Netlify's complementary frame/reporting header is absent
 *  locally. Stamping it here reproduces the two-policy production composition.
 *
 *  Call before `gotoApp`, and before any `page.route` a spec needs to win over
 *  this one: Playwright checks the most recently added handler first, so a
 *  route added later wins, and only requests it declines reach this one. */
export async function enforceProductionCsp(page: Page) {
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback();
    const response = await route.fetch();
    const existingPolicy = response.headers()['content-security-policy'];
    const platformPolicy = SECURITY_HEADERS['Content-Security-Policy'];
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        'content-security-policy': existingPolicy
          ? `${existingPolicy}, ${platformPolicy}`
          : platformPolicy,
      },
    });
  });
}

/** Parent Center holds an independent Grown-Ups Only policy per protected
 *  feature, and this suite drives the web build, which ships every one of them
 *  at Never — only the store builds arm them (ADR-0094). A spec states which it
 *  wants rather than leaning on that: `never` (the default) so an unrelated spec
 *  reaches its target directly, `always` for the specs that exercise the real
 *  challenge, and `default` to seed nothing and assert what the build ships. */
export async function seedParentalGatePolicies(page: Page, mode: 'never' | 'always' | 'default') {
  if (mode !== 'default') {
    await page.addInitScript(
      ({ mode, modeKeys }) => {
        // Stands in for the build's default, so it only fills a policy nobody
        // has chosen: a spec that seeded its own before navigating keeps it, and
        // a reload keeps whatever the run has since chosen through Parent Center
        // — an init script runs again on every navigation, and overwriting there
        // would quietly undo the choice the spec is about to assert survived.
        for (const key of modeKeys) {
          if (localStorage.getItem(key) === null) localStorage.setItem(key, mode);
        }
      },
      {
        mode,
        modeKeys: [
          STORAGE_KEYS.parentalGateAiImageMode,
          STORAGE_KEYS.parentalGateImageReportMode,
          STORAGE_KEYS.parentalGateExternalLinksMode,
          STORAGE_KEYS.parentalGateFeedbackMode,
          STORAGE_KEYS.parentalGateParentCenterMode,
        ],
      }
    );
  }
}

export async function seedAiEnabled(page: Page) {
  await page.addInitScript(
    (aiImageEnabled) => localStorage.setItem(aiImageEnabled, 'true'),
    STORAGE_KEYS.aiImageEnabled
  );
}

export async function seedCompletedSettingsActivitySessions(page: Page, count: number) {
  await page.addInitScript(
    ({ key, count }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, String(count));
    },
    { key: STORAGE_KEYS.settingsActivitySessionCount, count }
  );
}

const DRAWING_READY_TIMEOUT_MS = 10_000;
const DRAWING_COMMIT_ATTEMPT_TIMEOUT_MS = 1500;

export function readDrawingHistory(page: Page): Promise<HistoryDebug | null> {
  return page.evaluate(() => window.__drawingDebug?.getUndoDebug() ?? null);
}

async function waitForDrawableRenderedCanvas(page: Page) {
  await expect
    .poll(
      async () => {
        if (!(await readDrawingHistory(page))) return false;
        const canvas = await renderedCanvasHandle(page);
        try {
          return await canvas.evaluate((element) => element.width > 0 && element.height > 0);
        } finally {
          await canvas.dispose();
        }
      },
      { timeout: DRAWING_READY_TIMEOUT_MS }
    )
    .toBe(true);
}

async function waitForCommittedDrawingHistory(
  page: Page,
  strokeRevision: number,
  timeoutMs: number
) {
  await expect
    .poll(
      async () => {
        const history = await readDrawingHistory(page);
        return history
          ? {
              strokeRevision: history.strokeRevision,
              pendingCommands: history.pendingCommands,
            }
          : null;
      },
      { timeout: timeoutMs }
    )
    .toEqual({ strokeRevision, pendingCommands: 0 });
}

/** Navigate to the drawing app and wait for its hydrated engine and rendered
 *  composite to become drawable. Early-boot specs navigate directly. */
export async function gotoApp(
  page: Page,
  path = '/',
  { gates = 'never' }: { gates?: 'never' | 'always' | 'default' } = {}
) {
  await seedParentalGatePolicies(page, gates);
  await page.goto(path);
  await expect(page.locator('#drawingCanvas')).toBeVisible();
  await waitForDrawableRenderedCanvas(page);
}

export async function registerServiceWorkerAndControl(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
        once: true,
      });
    });
  });
}

/** Drive a real SvelteKit client-side navigation. The sentinel survives a SPA
 *  route change but a full reload erases it, so callers can prove which path ran. */
export async function spaNavigate(page: Page, href: string) {
  await page.evaluate(() => ((window as Window & { __spa?: boolean }).__spa = true));
  await page.evaluate((target) => {
    const link = document.createElement('a');
    link.href = target;
    document.body.appendChild(link);
    link.click();
  }, href);
}

export async function expectNoReload(page: Page) {
  const noReload = await page.evaluate(() => (window as Window & { __spa?: boolean }).__spa);
  expect(noReload, 'expected a client-side navigation, not a full reload').toBe(true);
}

// Open an overlay/flyout/dialog robustly and leave it open. Several of these
// controls idle-mount (ADR-0049) or reposition on the first frame, so the first
// click can land before the handler is wired and be dropped; a flyout toggle
// must also not be re-clicked when it's already open (that would toggle it
// shut). Retry the whole open until `ready` — the control's presence sentinel —
// is visible, skipping the click whenever it already is. `ready` must be a
// durable product state: a transient prerendered/native state can satisfy this
// loop and then disappear during hydration. `open` owns the click (and its own
// per-click timeout); `settle` is the per-attempt wait for `ready`.
export async function retryOpen(
  ready: Locator,
  open: () => Promise<void>,
  { timeout = 10_000, settle = 1500 }: { timeout?: number; settle?: number } = {}
) {
  await expect(async () => {
    if (!(await ready.isVisible().catch(() => false))) await open();
    await expect(ready).toBeVisible({ timeout: settle });
  }).toPass({ timeout });
}

// Wait for a fly-in dialog to land on its resting position before anything reads
// a coordinate off it.
//
// `dialogFlyFromOrigin` (app.css) starts the dialog scaled down onto the button
// that opened it, and modalDialog arms a launch dead zone at that same point
// (launchGuard's LAUNCH_ZONE_RADIUS_PX / LAUNCH_ZONE_DURATION_MS) whose capture-phase
// pointerdown handler swallows every event landing inside it — dialog content
// included, by design, so a toddler's repeat taps can't work the controls that
// painted under the finger. So for the opening frames the *whole* dialog sits
// inside that dead zone.
//
// A CSS animation advances with rendered frames, so a starved worker can leave
// the dialog parked on that first keyframe far longer than the animation's own
// timeline suggests. A spec that reads an element's live rect and dispatches
// synthetic pointer events there — bypassing the actionability checks a real
// Playwright click performs — then aims straight into the dead zone and gets
// swallowed. Waiting for the landing removes the dependency on animation
// progress rather than timing it. Measurements and the failure it caused:
// ADR-0078 §4a.
export async function settleFlyIn(dialog: Locator) {
  await dialog.evaluate((el) =>
    // A cancelled animation (the dialog closing under us) rejects `finished`;
    // that leaves nothing to wait for, which is the same answer as landing.
    Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => undefined)))
  );
}

// Frames the wide Settings pane is given to finish filling before the wait
// calls it stuck. Counted in frames because the fill is: one section per frame
// once the card lands (issue #910), then however many more What's New spends
// revealing its release notes (ADR-0061). A wall-clock cap is the wrong unit
// here — contention stretches each frame without adding any, so the default 5s
// expect timeout failed WebKit smoke on a fill that was merely unfinished
// (issue #918). A healthy fill is a frame or two per section plus that staging,
// so this is more than an order of magnitude past it: a bound on a fill that has
// genuinely stopped, never a schedule a live one can outrun.
export const SETTINGS_FILL_FRAME_BUDGET = 300;

// Wait for the wide Settings pane to stop reporting itself busy, i.e. for every
// section to be in it — which is what makes an offset read off the pane, or a
// node an axe scan walks, the final one. Sampled a frame at a time from inside
// the page, on the fill's own clock: a round trip to the test process measures
// the harness instead, and on a starved worker one can span the whole fill
// (settings-mount.spec.ts watches the same fill the same way).
//
// The frame budget is the whole of this wait's own bound, and it needs to be:
// none of Playwright's timeouts reach the sampling. `locator.evaluate`'s
// `timeout` is spent resolving the element (`_withElement` passes it to
// `waitForSelector` and hands the task only a deadline it ignores), so it never
// covers the promise the page function returns — an explicit 3s cap let a
// measured 10s in-page promise run to completion — and `actionTimeout` defaults
// to 0 under the test runner anyway. So a fill that never finishes is bounded by
// the test timeout, and the budget is what turns that into a pointed failure.
export async function settleSettingsPane(pane: Locator) {
  await pane.evaluate(
    (el, budget) =>
      new Promise<void>((resolve, reject) => {
        let frames = 0;
        const read = () => {
          if (el.getAttribute('aria-busy') === 'false') {
            resolve();
          } else if (++frames > budget) {
            const sections = el.querySelectorAll('.settings-section').length;
            const rows = document.querySelectorAll('.settings-nav .toc-row').length;
            reject(
              new Error(
                `Settings pane still busy after ${budget} frames — ${sections} of ${rows} sections in`
              )
            );
          } else {
            requestAnimationFrame(read);
          }
        };
        requestAnimationFrame(read);
      }),
    SETTINGS_FILL_FRAME_BUDGET
  );
}

// Open Settings robustly and return its modal locator. It idle-mounts
// on first open (ADR-0049), so the first click can be lost before its handler is
// wired — retryOpen rides that out and skips the click when it's already open.
export async function openSettingsModal(page: Page) {
  const modal = page.locator('#settingsModal');
  await retryOpen(modal, () =>
    page.getByRole('button', { name: 'Settings' }).click({ timeout: 3000 })
  );
  await settleFlyIn(modal);
  // The wide shell mounts its sections a frame at a time (issue #910), so on a
  // wide viewport the pane is still growing when the card lands — every offset a
  // spec reads off it, and every section an axe scan walks, is only final once
  // the pane stops reporting itself busy. The fly-in is no proxy for it: that is
  // wall-clock, this is frames, and a starved worker separates the two.
  const pane = modal.locator('.settings-pane');
  if (await pane.count()) await settleSettingsPane(pane);
  return modal;
}

// Drill the phone Settings hub into one of its sections, identified by a field
// only that section renders. The rows sit on a scroller that idle-mounts and
// flies in, so the first tap can land before the section is wired — the hazard
// openSettingsModal itself rides out.
export async function openHubSection(page: Page, section: string, expectedField: string) {
  await expect(async () => {
    await page.locator(`.hub-row[data-section="${section}"]`).click({ timeout: 1000 });
    await expect(page.locator(expectedField)).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
}

const DISCLOSURE_PICK_ATTEMPT_TIMEOUT_MS = 1000;
const DISCLOSURE_PICK_TIMEOUT_MS = 10_000;

// Open a TocDisclosure (the narrow-screen contents row on /design and
// /changelog) and prove it is hydrated before returning. The <details> toggles
// natively, so the panel opens before the component's delegated pick handler
// exists — a row activated inside that window gets the browser's own anchor
// jump, the hazard TocDisclosure.svelte documents as accepted rather than
// fixed. The computed px max-height is the hydration proof: only the
// component's post-hydration cap effect sets it. The open itself retries
// because hydration reconciles the natively-opened <details> back to the
// component's closed state, swallowing an early click.
export async function openHydratedContents(contents: Locator) {
  const panel = contents.locator('.panel');
  await expect(async () => {
    if (!(await panel.isVisible().catch(() => false))) {
      await contents.locator('summary').click({ timeout: DISCLOSURE_PICK_ATTEMPT_TIMEOUT_MS });
    }
    await expect(panel).toHaveCSS('max-height', /\d+px/, {
      timeout: DISCLOSURE_PICK_ATTEMPT_TIMEOUT_MS,
    });
  }).toPass({ timeout: DISCLOSURE_PICK_TIMEOUT_MS });
}

// The highlighted Settings row's own seat, measured against the column that
// holds it. Read off the nav rather than the browser viewport: the column is its
// own scroller wherever the section list outgrows it, and that clipping is the
// thing at stake.
export function activeNavRowInsideColumn(page: Page) {
  return page.locator('.settings-nav .toc-row.active').evaluate((row) => {
    const box = row.closest('.settings-nav')!.getBoundingClientRect();
    const seat = row.getBoundingClientRect();
    return seat.top >= box.top - 0.5 && seat.bottom <= box.bottom + 0.5;
  });
}

// The widest a jumped-to heading may sit below the pane's top edge and still
// count as landed. Deliberately looser than the shell's own
// `SECTION_JUMP_INSET_PX` so retuning that inset stays a design decision rather
// than a spec edit — a tolerance, not a mirrored copy of it. A section that did
// not scroll at all sits hundreds of pixels away.
export const SECTION_LANDED_MAX_PX = 24;

// How far a Settings section's heading sits below the scrolling pane's top edge
// — the measurement the wide shell's click-to-jump landing and its scrollspy are
// both specified in.
export function headingOffsetFromPaneTop(page: Page, section: string) {
  return page
    .locator(`.settings-section[data-section="${section}"]`)
    .evaluate(
      (el) =>
        el.getBoundingClientRect().top - el.closest('.settings-pane')!.getBoundingClientRect().top
    );
}

// How much of the engine's dropped-pointer jump threshold one dispatched sample
// may cover. The engine reads "far from the previous sample AND more than
// POINTER_RESUME_GAP_MS after it" as a finger that lifted and set down
// (strokeMath.pointerWasResumed), restarts the stroke at the new point, and never
// paints the span between the two — so a four-point sweep can come back as its
// start dot alone (measured 132 of 2314 opaque px at 8 workers, revealing one
// flat fill region). A starved worker spends 100ms between two moves whatever a
// spec does, so the jump is the only half of that predicate a test can hold:
// subdivide every hop into samples inside the threshold.
//
// The fraction is sized for the worst mapping rather than the nominal one. The
// threshold is a fraction of the PAPER's shorter side, while this paces in CSS px
// across the canvas: under a rotation lock the paper is contain-fit into the
// canvas, so one CSS hop is a proportionally LARGER jump in paper space (÷0.6 in
// the rotation specs' geometry). Two fifths keeps even that inside the threshold.
const RESUME_JUMP_BUDGET_FRACTION = 0.4;

/** Drag a stroke through the given canvas-space points using real mouse input. */
export async function dragStroke(
  page: Page,
  box: { x: number; y: number; width: number; height: number } | null,
  points: { x: number; y: number }[]
) {
  if (!box) throw new Error('canvas has no bounding box');
  if (points.length === 0) throw new Error('cannot draw a stroke without points');
  const hopBudgetPx =
    Math.min(box.width, box.height) * POINTER_RESUME_JUMP_RATIO * RESUME_JUMP_BUDGET_FRACTION;
  await page.mouse.move(box.x + points[0].x, box.y + points[0].y);
  await page.mouse.down();
  let from = points[0];
  for (const p of points.slice(1)) {
    const hop = Math.hypot(p.x - from.x, p.y - from.y);
    await page.mouse.move(box.x + p.x, box.y + p.y, {
      steps: Math.max(1, Math.ceil(hop / hopBudgetPx)),
    });
    from = p;
  }
  await page.mouse.up();
}

/** Drag a stroke through canvas-relative points with real mouse input. */
export async function draw(page: Page, points: { x: number; y: number }[]) {
  const box = await page.locator('#drawingCanvas').boundingBox();
  await dragStroke(page, box, points);
}

export async function drawCommittedStroke(page: Page, points: { x: number; y: number }[]) {
  const baseline = await readDrawingHistory(page);
  if (!baseline) throw new Error('drawing history is unavailable');
  if (baseline.pendingCommands !== 0) {
    throw new Error('cannot start a committed stroke while another drawing command is pending');
  }
  if (baseline.strokeRevision === undefined) {
    throw new Error('drawing stroke revision is unavailable');
  }
  const targetStrokeRevision = baseline.strokeRevision + 1;

  // A failed short commit wait retries the input only when history still proves
  // the previous attempt produced neither a pending nor a committed command.
  await expect(async () => {
    const history = await readDrawingHistory(page);
    if (!history) throw new Error('drawing history became unavailable');
    if (history.strokeRevision === baseline.strokeRevision && history.pendingCommands === 0) {
      await draw(page, points);
    }
    await waitForCommittedDrawingHistory(
      page,
      targetStrokeRevision,
      DRAWING_COMMIT_ATTEMPT_TIMEOUT_MS
    );
  }).toPass({ timeout: DRAWING_READY_TIMEOUT_MS });
}

export function renderedCanvasHandle(page: Page): Promise<JSHandle<HTMLCanvasElement>> {
  return page.evaluateHandle(compositeVisibleLiveTiles, undefined);
}

/** First non-transparent pixel on the canvas as [r,g,b,a], or null if blank. */
export async function firstOpaquePixel(page: Page): Promise<Rgba | null> {
  const canvas = await renderedCanvasHandle(page);
  try {
    return await canvas.evaluate((c): Rgba | null => {
      // expect.poll does not retry callback errors, so callers waiting for mount
      // establish renderedCanvasHasArea before using this blank-canvas reader.
      if (c.width === 0 || c.height === 0)
        throw new Error('live tiles are not mounted yet — the composite has no area');
      const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] > 0) return [data[i - 3], data[i - 2], data[i - 1], data[i]];
      }
      return null;
    });
  } finally {
    await canvas.dispose();
  }
}

export function isBlueDominant(px: Rgba) {
  return px[2] > px[0];
}

export async function hasRedDominantPixel(page: Page): Promise<boolean> {
  const canvas = await renderedCanvasHandle(page);
  try {
    return await canvas.evaluate((c) => {
      const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 200 && data[i] > 200 && data[i + 1] < 120 && data[i + 2] < 120)
          return true;
      }
      return false;
    });
  } finally {
    await canvas.dispose();
  }
}

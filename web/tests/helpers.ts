import { expect, type Locator, type Page } from '@playwright/test';

import { COLOR_FAMILIES } from '../src/lib/hexPickerLayout';
import { POINTER_RESUME_JUMP_RATIO } from '../src/lib/drawing/strokeMath';

// Shared E2E helpers used across specs. Keep this module WebKit-portable — no
// CDP sessions or dev-harness routes — because webkit-smoke.spec.ts imports it
// (see web/tests/CLAUDE.md).

export const TEST_PALETTE = {
  purple: '#AB71E1',
  blue: '#62A2E9',
  teal: '#4FC4C0',
  green: '#8CC864',
  yellow: '#F9D24F',
  orange: '#F89C45',
  brown: '#B5835A',
  red: '#EC534E',
  pink: '#F47CB0',
  black: '#0a0b10',
};

export const PICKER_GREEN = COLOR_FAMILIES.find((family) => family.name === 'greens')!.shades[4];
export const CUSTOM_SWATCH_COLOR = 'custom';

export type Rgba = readonly [number, number, number, number];

// Must remain greater than the engine's COLOR_CHANGE_DEBOUNCE_MS (100).
export const COLOR_CHANGE_DEBOUNCE_SETTLE_MS = 150;

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

/** Navigate to the app and wait for hydration: the canvas mounts on the client,
 *  so once it's visible the app has hydrated. */
export async function gotoApp(page: Page, path = '/') {
  await page.goto(path);
  await expect(page.locator('#drawingCanvas')).toBeVisible();
}

// Open an overlay/flyout/dialog robustly and leave it open. Several of these
// controls idle-mount (ADR-0049) or reposition on the first frame, so the first
// click can land before the handler is wired and be dropped; a flyout toggle
// must also not be re-clicked when it's already open (that would toggle it
// shut). Retry the whole open until `ready` — the control's presence sentinel —
// is visible, skipping the click whenever it already is. `open` owns the click
// (and its own per-click timeout); `settle` is the per-attempt wait for `ready`.
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
// `dialogFlyFromOrigin` (app.css) starts the dialog at `scale(0.05)` translated
// onto the button that opened it, and modalDialog arms a launch dead zone at that
// same point (launchGuard: 72px, 600ms) whose capture-phase pointerdown handler
// swallows every event landing inside it — dialog content included, by design, so
// a toddler's repeat taps can't work the controls that painted under the finger.
// So for the opening frames the *whole* dialog sits inside that dead zone: at the
// first keyframe the Parent Center's content pane centers 6px from the launch
// origin, and it only clears the 72px radius about 13ms into the animation.
//
// A CSS animation advances with rendered frames, so a starved worker can leave
// the dialog parked on that first keyframe for far longer than 13ms of wall
// clock. A spec that reads the pane's live rect and dispatches synthetic pointer
// events there — bypassing the actionability checks a real Playwright click
// performs — then aims its gesture straight into the dead zone and gets it
// swallowed. That was issue #665: three zoom/pinch specs whose pinch silently
// did nothing, together the whole residual flake rate (ADR-0078 §4).
//
// Once the fly-in has finished the pane rests 574px from the launch origin, well
// outside any dead zone, so waiting here removes the dependency on animation
// progress rather than timing it.
async function settleFlyIn(dialog: Locator) {
  await dialog.evaluate((el) =>
    // A cancelled animation (the dialog closing under us) rejects `finished`;
    // that leaves nothing to wait for, which is the same answer as landing.
    Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => undefined)))
  );
}

// Open the Parent Center robustly and return its modal locator. It idle-mounts
// on first open (ADR-0049), so the first click can be lost before its handler is
// wired — retryOpen rides that out and skips the click when it's already open.
export async function openParentCenter(page: Page) {
  const modal = page.locator('#parentHelpModal');
  await retryOpen(modal, () =>
    page.getByRole('button', { name: 'Parent Center' }).click({ timeout: 3000 })
  );
  await settleFlyIn(modal);
  return modal;
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

/** First non-transparent pixel on the canvas as [r,g,b,a], or null if blank. */
export function firstOpaquePixel(page: Page): Promise<Rgba | null> {
  return page.evaluate((): Rgba | null => {
    const c = document.getElementById('drawingCanvas') as HTMLCanvasElement;
    const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return [data[i - 3], data[i - 2], data[i - 1], data[i]];
    }
    return null;
  });
}

export function isBlueDominant(px: Rgba) {
  return px[2] > px[0];
}

export function hasRedDominantPixel(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const canvas = document.getElementById('drawingCanvas') as HTMLCanvasElement;
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 200 && data[i] > 200 && data[i + 1] < 120 && data[i + 2] < 120) return true;
    }
    return false;
  });
}

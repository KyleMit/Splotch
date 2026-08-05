import { expect, test, type Page } from '@playwright/test';
import { gotoApp, openSettingsModal } from './helpers';

// Tier-2 accessibility (ADR-0076): a low-vision parent can pinch to enlarge the
// Settings' reading content, while the drawing page itself stays
// zoom-locked. The pinchTextZoom action drives CSS `zoom` on a `.settings-zoom` wrapper
// inside the scrolling pane. The gesture math and pointer bookkeeping are
// unit-tested (pinchTextZoom.svelte.test.ts); this covers the wiring in a real
// browser — that two
// fingers enlarge and reset, that ONE finger is never intercepted (so native
// scrolling survives — the invariant the whole design rests on), that a
// non-touch pointer is ignored, and that navigating away resets the zoom.

// Read the inline CSS `zoom` the action sets (blank/absent ⇒ normal size ⇒ 1).
async function paneZoom(page: Page): Promise<number> {
  return page.locator('.settings-zoom').evaluate((el) => {
    const z = (el as HTMLElement).style.zoom;
    return z === '' ? 1 : Number(z);
  });
}

// Fire a synthetic gesture on the content pane and report whether the action
// intercepted the move (called preventDefault — i.e. it took the gesture over
// from native scrolling). `fingers: 1` is a lone drag that must pass through;
// `fingers: 2` is a pinch spreading apart by `factor`. `pointerType: 'mouse'`
// must be ignored entirely (the action only engages real touch).
//
// The coordinates come from the pane's live rect, so the caller must have let the
// dialog land first — a pane still flying in sits inside the modal's launch dead
// zone, which swallows the gesture (settleFlyIn in helpers.ts).
async function gestureOnPane(
  page: Page,
  opts: { fingers: 1 | 2; pointerType?: 'touch' | 'mouse'; factor?: number }
): Promise<{ movePrevented: boolean }> {
  return page
    .locator('.settings-pane, .settings-scroll')
    .first()
    .evaluate((node, o) => {
      const r = node.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const f = o.factor ?? 3;
      const type = o.pointerType ?? 'touch';
      const fire = (name: string, id: number, x: number, y: number) => {
        const ev = new PointerEvent(name, {
          pointerId: id,
          pointerType: type,
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
        });
        node.dispatchEvent(ev);
        return ev;
      };
      let movePrevented: boolean;
      if (o.fingers === 1) {
        fire('pointerdown', 1, cx, cy);
        movePrevented = fire('pointermove', 1, cx, cy - 60).defaultPrevented;
        fire('pointerup', 1, cx, cy - 60);
      } else {
        fire('pointerdown', 1, cx - 10, cy);
        fire('pointerdown', 2, cx + 10, cy);
        movePrevented = fire('pointermove', 1, cx - 10 * f, cy).defaultPrevented;
        fire('pointermove', 2, cx + 10 * f, cy);
        fire('pointerup', 1, cx - 10 * f, cy);
        fire('pointerup', 2, cx + 10 * f, cy);
      }
      return { movePrevented };
    }, opts);
}

interface TouchPoint {
  x: number;
  y: number;
  id: number;
}

// Real compositor touch, which synthetic PointerEvents cannot stand in for here:
// `setPointerCapture` silently no-ops on a pointer id the browser doesn't know
// about (verified in Chromium — it neither throws nor captures), so only genuine
// touch exercises the action's capture path.
//
// `touchEnd` names the points being *released*; every other type names the full
// set of active points.
async function touchDriver(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  return (type: 'touchStart' | 'touchMove' | 'touchEnd', touchPoints: TouchPoint[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
}

type TouchSend = Awaited<ReturnType<typeof touchDriver>>;

async function paneBox(page: Page) {
  const pane = page.locator('.settings-pane, .settings-scroll').first();
  const box = await pane.boundingBox();
  if (!box) throw new Error('pane not visible');
  return { pane, box };
}

// Drag one finger up the pane — a plain scroll, and also a *fresh* gesture, which
// is what clears the pinch's ghost-click latch (`pointerCount === 0` on
// pointerdown). Both misbehave if the tracker is still holding a finger that the
// pane never saw lift.
async function scrollOneFinger(
  send: TouchSend,
  box: { x: number; y: number; width: number; height: number }
) {
  const x = box.x + box.width / 2;
  const yBottom = box.y + box.height * 0.8;
  const yTop = box.y + box.height * 0.2;
  await send('touchStart', [{ x, y: yBottom, id: 0 }]);
  await send('touchMove', [{ x, y: (yBottom + yTop) / 2, id: 0 }]);
  await send('touchMove', [{ x, y: yTop, id: 0 }]);
  await send('touchEnd', [{ x, y: yTop, id: 0 }]);
}

// Two real fingers pinch, then the resting finger drifts above the pane's top
// edge and lifts *outside* it — the pane is not where that finger comes up.
//
// A touch pointer's events keep going to the element it went down on for the
// pointer's whole life (implicit pointer capture, Pointer Events §"Implicit
// Pointer Capture"), so the pane does still receive that lift and the tracker
// stays balanced. That is the property these tests hold in place: it is the
// browser's to provide, and the action leans on it — a change that forfeited it
// (releasing capture mid-gesture, `touch-action: none` turning the drift into a
// `pointercancel` that arrives elsewhere) would strand a finger in the tracker,
// and from then on one-finger scrolling would drive the zoom from a stale spread
// and the ghost-click guard would eat every tap.
//
// Setup only; the callers assert.
async function pinchLiftingAFingerOutsideThePane(page: Page) {
  const { pane, box } = await paneBox(page);
  const send = await touchDriver(page);

  const resting = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.5, id: 0 };
  const spreading = { x: box.x + box.width * 0.7, y: box.y + box.height * 0.5, id: 1 };
  const spread = { ...spreading, x: box.x + box.width * 0.95 };
  const drifted = { ...resting, y: box.y - 40 };

  await send('touchStart', [resting]);
  await send('touchStart', [resting, spreading]);
  await send('touchMove', [drifted, spread]);
  await send('touchEnd', [drifted]);
  await send('touchEnd', [spread]);

  return { pane, box, send };
}

async function pinchUntilZoomed(page: Page, factor = 2): Promise<boolean> {
  let movePrevented = false;
  await expect(async () => {
    ({ movePrevented } = await gestureOnPane(page, { fingers: 2, factor }));
    expect(await paneZoom(page)).toBeGreaterThan(1);
  }).toPass();
  return movePrevented;
}

test('a two-finger pinch enlarges the pane (and intercepts the gesture)', async ({ page }) => {
  await gotoApp(page);
  await openSettingsModal(page);

  expect(await paneZoom(page)).toBe(1);

  const movePrevented = await pinchUntilZoomed(page);
  // A real pinch is taken over from native scrolling.
  expect(movePrevented).toBe(true);
});

test('a pinch swallows the trailing click, so it never toggles the control beneath it', async ({
  page,
}) => {
  await gotoApp(page);
  await openSettingsModal(page);

  // A two-finger gesture leaves the action primed to eat the primary finger's
  // click (which would otherwise open a section or flip a toggle under the
  // finger). Exactly one click is swallowed; the next is a real tap again.
  await pinchUntilZoomed(page);
  const { first, second } = await page
    .locator('.settings-pane, .settings-scroll')
    .first()
    .evaluate((node) => {
      const clickOnce = () => {
        const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
        node.dispatchEvent(ev);
        return ev.defaultPrevented;
      };
      return { first: clickOnce(), second: clickOnce() };
    });
  expect(first).toBe(true); // the ghost click is cancelled
  expect(second).toBe(false); // a subsequent genuine tap goes through
});

test('a one-finger drag actually scrolls the pane (native scrolling survives)', async ({
  page,
}) => {
  await gotoApp(page);
  await openSettingsModal(page);

  // Part 1: the action never intercepts a lone pointer (no zoom, no preventDefault).
  const { movePrevented } = await gestureOnPane(page, { fingers: 1 });
  expect(await paneZoom(page)).toBe(1);
  expect(movePrevented).toBe(false);

  // Part 2: and a *real* one-finger touch drag genuinely scrolls the pane — the
  // load-bearing invariant. Enlarge first so the content overflows, then drive
  // real compositor touch (not synthetic pointer events) via CDP: a future
  // `touch-action: none` on the pane or an ancestor would block this and fail
  // here, where the `movePrevented` check alone would sail past it.
  await page.locator('.settings-nav').getByRole('button', { name: 'Setup Guide' }).click();
  await pinchUntilZoomed(page, 3);

  const { pane, box } = await paneBox(page);
  await scrollOneFinger(await touchDriver(page), box);

  await expect
    .poll(() => pane.evaluate((el) => el.scrollTop), { timeout: 2000 })
    .toBeGreaterThan(0);
});

// These two run the whole gesture through real compositor touch, so they cover
// what no synthetic-pointer test can: whether the pane is left usable after a
// finger comes up somewhere else. They assert the outcome a parent would notice,
// not the mechanism — the pinch's own pointer bookkeeping is unit-tested.
test('a scroll after a pinch finger lifted outside the pane scrolls instead of zooming', async ({
  page,
}) => {
  await gotoApp(page);
  await openSettingsModal(page);
  await page.locator('.settings-nav').getByRole('button', { name: 'Setup Guide' }).click();

  const { pane, box, send } = await pinchLiftingAFingerOutsideThePane(page);
  await expect.poll(() => paneZoom(page)).toBeGreaterThan(1);
  const zoomed = await paneZoom(page);

  await scrollOneFinger(send, box);

  // Were the lifted finger still tracked, the count would read two, so this lone
  // finger would drive the zoom and `preventDefault` would block the scroll.
  await expect
    .poll(() => pane.evaluate((el) => el.scrollTop), { timeout: 2000 })
    .toBeGreaterThan(0);
  expect(await paneZoom(page)).toBe(zoomed);
});

test('a tap after a pinch finger lifted outside the pane is not swallowed', async ({ page }) => {
  await gotoApp(page);
  await openSettingsModal(page);
  await page.locator('.settings-nav').getByRole('button', { name: 'Setup Guide' }).click();

  const { pane, box, send } = await pinchLiftingAFingerOutsideThePane(page);
  await scrollOneFinger(send, box);

  // That fresh one-finger gesture disarms the pinch's ghost-click latch — unless a
  // still-tracked finger holds the count at two, which re-arms it on every
  // pointerdown and kills every later tap.
  const swallowed = await pane.evaluate((node) => {
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    node.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  expect(swallowed).toBe(false);
});

test('a non-touch (mouse) pinch is ignored', async ({ page }) => {
  await gotoApp(page);
  await openSettingsModal(page);

  const { movePrevented } = await gestureOnPane(page, { fingers: 2, pointerType: 'mouse' });
  // Desktop uses browser zoom; the action only engages real touch, so a
  // two-"finger" mouse gesture leaves the pane untouched.
  expect(await paneZoom(page)).toBe(1);
  expect(movePrevented).toBe(false);
});

test('navigating to another section resets the zoom', async ({ page }) => {
  await gotoApp(page);
  await openSettingsModal(page);

  await pinchUntilZoomed(page);

  // Switching sections (resetKey: view) returns the pane to normal size, so a
  // parent never lands on a new section still enlarged from the previous one.
  await page.locator('.settings-nav').getByRole('button', { name: 'Sound' }).click();
  await expect.poll(() => paneZoom(page)).toBe(1);
});

// Regression guard for the tier-1 tradeoff: dropping user-scalable=no reopens
// iOS Safari's focus-zoom on inputs whose font-size is < 16px, which would zoom
// the visual viewport and strand the canvas (ADR-0076). Every focusable input
// reachable on the drawing route must render ≥ 16px.
test('parent-facing inputs on the drawing route render ≥16px (no iOS focus-zoom)', async ({
  page,
}) => {
  await gotoApp(page);
  await openSettingsModal(page);

  const fontPx = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

  await page.locator('.settings-nav').getByRole('button', { name: 'AI Art' }).click();
  await expect(page.locator('.access-code-input').first()).toBeVisible();
  expect(await fontPx('.access-code-input')).toBeGreaterThanOrEqual(16);

  await page.locator('.settings-nav').getByRole('button', { name: 'Submit Feedback' }).click();
  await expect(page.locator('.report-textarea')).toBeVisible();
  expect(await fontPx('.report-textarea')).toBeGreaterThanOrEqual(16);
});

test('closing the overlay resets the zoom for the next open', async ({ page }) => {
  await gotoApp(page);
  await openSettingsModal(page);

  await pinchUntilZoomed(page);

  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('#settingsModal')).toBeHidden();
  await openSettingsModal(page);
  expect(await paneZoom(page)).toBe(1);
});

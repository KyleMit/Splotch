import type { ElementHandle, Locator, Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';
import { openDrawingScreen } from '../support/drawing.ts';
import { openSettings, settledBox } from '../support/group-c.ts';

// A low-vision parent can pinch to enlarge Settings' reading content while the drawing screen stays
// zoom-locked: two fingers enlarge and reset, ONE finger is never intercepted (so native scrolling
// survives, the invariant the whole design rests on), a finger lifting outside the pane is still
// reported to it, a mouse is ignored, and moving to another section or closing resets the zoom. The
// gesture math is unit-tested where the gesture lives; this covers the wiring in a real browser.

// A landing heading parks this near the top of the pane however far the parent pinched, because CSS
// zoom on the child content does not scale the pane's own coordinate space.
const SECTION_LANDED_MAX_PX = 24;
const MIN_FONT_PX = 16;
const PINCH_FACTOR = 2;
const BIG_PINCH_FACTOR = 3;
const SCROLL_TIMEOUT_MS = 2_000;
// One attempt of a retried step, short enough that the retry loop gets several.
const RETRY_STEP_MS = 1_000;
const PHONE = { width: 460, height: 852 };

const zoomNode = (page: Page) => page.getByTestId('settings-text-zoom').first();

// The inline CSS zoom the gesture sets; blank means normal size.
function paneZoom(page: Page): Promise<number> {
  return zoomNode(page).evaluate((node) => {
    const zoom = (node as HTMLElement).style.zoom;
    return zoom === '' ? 1 : Number(zoom);
  });
}

// The scroller the zoomed content lives in, found beside the dialog's scroll cue.
async function paneScroller(page: Page): Promise<ElementHandle<HTMLElement>> {
  const cue = page.getByRole('dialog', { name: 'Settings' }).getByTestId('scroll-cue');
  return (await cue.evaluateHandle((node) => {
    const found = [...(node.parentElement?.querySelectorAll('*') ?? [])].find((element) =>
      /(auto|scroll)/.test(getComputedStyle(element).overflowY)
    );
    if (!found) throw new Error('The pane has no scroller');
    return found;
  })) as ElementHandle<HTMLElement>;
}

// Fires a synthetic gesture on the zoomed content and reports whether the gesture took the move over
// from native scrolling (called preventDefault). One finger is a lone drag that must pass through; two
// are a pinch spreading apart by `factor`; a mouse is ignored entirely.
async function gestureOnPane(
  page: Page,
  {
    fingers,
    pointerType = 'touch',
    factor = PINCH_FACTOR,
  }: {
    fingers: 1 | 2;
    pointerType?: 'touch' | 'mouse';
    factor?: number;
  }
): Promise<{ movePrevented: boolean }> {
  const scroller = await paneScroller(page);
  return zoomNode(page).evaluate(
    (node, args) => {
      const rect = args.scroller.getBoundingClientRect();
      const [cx, cy] = [rect.left + rect.width / 2, rect.top + rect.height / 2];
      const fire = (name: string, id: number, x: number, y: number) => {
        const event = new PointerEvent(name, {
          pointerId: id,
          pointerType: args.pointerType,
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
        });
        node.dispatchEvent(event);
        return event;
      };
      if (args.fingers === 1) {
        fire('pointerdown', 1, cx, cy);
        const prevented = fire('pointermove', 1, cx, cy - 60).defaultPrevented;
        fire('pointerup', 1, cx, cy - 60);
        return { movePrevented: prevented };
      }
      fire('pointerdown', 1, cx - 10, cy);
      fire('pointerdown', 2, cx + 10, cy);
      const prevented = fire('pointermove', 1, cx - 10 * args.factor, cy).defaultPrevented;
      fire('pointermove', 2, cx + 10 * args.factor, cy);
      fire('pointerup', 1, cx - 10 * args.factor, cy);
      fire('pointerup', 2, cx + 10 * args.factor, cy);
      return { movePrevented: prevented };
    },
    { fingers, pointerType, factor, scroller }
  );
}

type TouchPoint = { x: number; y: number; id: number };

// Real compositor touch, which synthetic pointer events cannot stand in for: setPointerCapture
// silently does nothing on a pointer the browser does not know about. The protocol wants touchEnd to
// carry no points, so a partial release is not expressible: every finger still down lifts at once.
async function touchDriver(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const dispatch = (type: 'touchStart' | 'touchMove' | 'touchEnd', touchPoints: TouchPoint[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  return {
    start: (touchPoints: TouchPoint[]) => dispatch('touchStart', touchPoints),
    move: (touchPoints: TouchPoint[]) => dispatch('touchMove', touchPoints),
    end: () => dispatch('touchEnd', []),
    nextFrame: () =>
      page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))),
  };
}

type TouchDriver = Awaited<ReturnType<typeof touchDriver>>;
type Box = { x: number; y: number; width: number; height: number };
type PaneEvent = { type: string; pointerId: number; clientY: number };

async function paneBox(page: Page): Promise<{ scroller: ElementHandle<HTMLElement>; box: Box }> {
  const scroller = await paneScroller(page);
  const box = await scroller.boundingBox();
  if (!box) throw new Error('The pane is not visible');
  return { scroller, box };
}

// Records the pointer lifecycle the zoomed content observes, so a case asserts which path it took
// instead of assuming it: a gesture that quietly became a pointercancel would still leave the pane
// usable and claim coverage of a different path.
async function recordPaneEvents(page: Page) {
  await zoomNode(page).evaluate((node) => {
    const log: PaneEvent[] = [];
    Object.assign(node, { pointerLog: log });
    for (const type of ['pointerdown', 'pointerup', 'pointercancel'])
      node.addEventListener(type, (event) => {
        const pointer = event as PointerEvent;
        log.push({ type, pointerId: pointer.pointerId, clientY: pointer.clientY });
      });
  });
}

function paneEvents(page: Page): Promise<PaneEvent[]> {
  return zoomNode(page).evaluate(
    (node) => (node as unknown as { pointerLog: PaneEvent[] }).pointerLog
  );
}

// Drags one finger up the pane: a plain scroll, and a fresh gesture, which is what clears the
// pinch's ghost-click latch.
async function scrollOneFinger(touch: TouchDriver, box: Box) {
  const x = box.x + box.width / 2;
  const bottom = box.y + box.height * 0.8;
  const top = box.y + box.height * 0.2;
  await touch.start([{ x, y: bottom, id: 0 }]);
  await touch.nextFrame();
  await touch.move([{ x, y: (bottom + top) / 2, id: 0 }]);
  await touch.nextFrame();
  await touch.move([{ x, y: top, id: 0 }]);
  await touch.nextFrame();
  await touch.end();
}

// Two real fingers pinch, and the resting one drifts above the pane's top edge so it is outside the
// pane when the gesture releases. A touch pointer's events keep going to the element it went down on
// for its whole life (implicit capture), so the pane still receives that lift and its tracker stays
// balanced. A change that forfeited that would strand a finger in the tracker, after which one finger
// would drive the zoom from a stale spread and every later tap would be eaten.
async function pinchLiftingAFingerOutsideThePane(page: Page) {
  const { scroller, box } = await paneBox(page);
  await recordPaneEvents(page);
  const touch = await touchDriver(page);
  const resting = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.5, id: 0 };
  const spreading = { x: box.x + box.width * 0.7, y: box.y + box.height * 0.5, id: 1 };
  const spread = { ...spreading, x: box.x + box.width * 0.95 };
  const drifted = { ...resting, y: box.y - 40 };

  await touch.start([resting]);
  await touch.nextFrame();
  await touch.start([resting, spreading]);
  await touch.nextFrame();
  await touch.move([drifted, spread]);
  await touch.nextFrame();
  await touch.end();

  // The resting finger is whichever pointer id landed first; the browser assigns them.
  const liftedOutside = async () => {
    const log = await paneEvents(page);
    const restingId = log.find((event) => event.type === 'pointerdown')?.pointerId;
    return {
      log,
      lift: log.find((event) => event.pointerId === restingId && event.type !== 'pointerdown'),
      paneTop: box.y,
    };
  };
  return { scroller, box, touch, liftedOutside };
}

async function pinchUntilZoomed(page: Page, factor = PINCH_FACTOR): Promise<boolean> {
  let movePrevented = false;
  await expect(async () => {
    ({ movePrevented } = await gestureOnPane(page, { fingers: 2, factor }));
    expect(await paneZoom(page)).toBeGreaterThan(1);
  }).toPass();
  return movePrevented;
}

// The dialog flies in, so a finger placed by the pane's box would land on its way, not its place.
async function openSettingsReady(page: Page) {
  await openDrawingScreen(page);
  const settings = await openSettings(page);
  await settledBox(settings.getByTestId('modal-card'));
  return settings;
}

test('a two-finger pinch enlarges the pane and takes the gesture over from scrolling', async ({
  page,
}) => {
  await openSettingsReady(page);
  expect(await paneZoom(page)).toBe(1);

  expect(await pinchUntilZoomed(page)).toBe(true);
});

test('a pinch swallows the trailing click, so it never toggles the control beneath it', async ({
  page,
}) => {
  await openSettingsReady(page);
  await pinchUntilZoomed(page);

  // A two-finger gesture leaves the pinch primed to eat the primary finger's click, which would
  // otherwise open a section or flip a toggle under the finger. Exactly one click is swallowed; the
  // next is a real tap again. A pointer-synthesized click carries detail >= 1; detail 0 is keyboard
  // or assistive activation, which passes.
  const { first, second } = await zoomNode(page).evaluate((node) => {
    const clickOnce = () => {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 });
      node.dispatchEvent(event);
      return event.defaultPrevented;
    };
    return { first: clickOnce(), second: clickOnce() };
  });

  expect(first).toBe(true);
  expect(second).toBe(false);
});

test('a one-finger drag scrolls the pane, so native scrolling survives', async ({ page }) => {
  await openSettingsReady(page);

  // The pinch never intercepts a lone pointer: no zoom, no preventDefault.
  const { movePrevented } = await gestureOnPane(page, { fingers: 1 });
  expect(await paneZoom(page)).toBe(1);
  expect(movePrevented).toBe(false);

  // And a real one-finger touch drag genuinely scrolls the pane, on a pane enlarged first. A future
  // touch-action: none on the pane or an ancestor would block this and fail here, where the
  // movePrevented check alone would sail past it.
  await pinchUntilZoomed(page, BIG_PINCH_FACTOR);
  const { scroller, box } = await paneBox(page);
  await scrollOneFinger(await touchDriver(page), box);

  await expect
    .poll(() => scroller.evaluate((node) => node.scrollTop), { timeout: SCROLL_TIMEOUT_MS })
    .toBeGreaterThan(0);
});

// These three run the whole gesture through real compositor touch, covering what no synthetic pointer
// can: a finger coming up outside the pane is still reported to it, and the pane stays usable. The
// first asserts the mechanism, because the two behavioural cases cannot: the pinch handles
// pointercancel as well as pointerup, so a gesture that silently became a cancel would still pass both.
test('a pinch finger that lifts outside the pane still reports its lift to the pane', async ({
  page,
}) => {
  await openSettingsReady(page);

  const { liftedOutside } = await pinchLiftingAFingerOutsideThePane(page);
  const { log, lift, paneTop } = await liftedOutside();

  expect(lift?.type).toBe('pointerup');
  expect(lift?.clientY ?? Infinity).toBeLessThan(paneTop);
  expect(log.map(({ type }) => type)).toEqual([
    'pointerdown',
    'pointerdown',
    'pointerup',
    'pointerup',
  ]);
});

test('a scroll after a pinch finger lifted outside the pane scrolls instead of zooming', async ({
  page,
}) => {
  await openSettingsReady(page);
  const { scroller, box, touch, liftedOutside } = await pinchLiftingAFingerOutsideThePane(page);
  await expect.poll(() => paneZoom(page)).toBeGreaterThan(1);
  const zoomed = await paneZoom(page);
  // The precondition, not the behaviour under test: this run took the lifted-outside path rather
  // than the cancel path, which would also pass below.
  expect((await liftedOutside()).lift?.type).toBe('pointerup');

  await scrollOneFinger(touch, box);

  // Were the lifted finger still tracked, the count would read two, so this lone finger would drive
  // the zoom and preventDefault would block the scroll.
  await expect
    .poll(() => scroller.evaluate((node) => node.scrollTop), { timeout: SCROLL_TIMEOUT_MS })
    .toBeGreaterThan(0);
  expect(await paneZoom(page)).toBe(zoomed);
});

test('a tap after a pinch finger lifted outside the pane is not swallowed', async ({ page }) => {
  await openSettingsReady(page);
  const { box, touch, liftedOutside } = await pinchLiftingAFingerOutsideThePane(page);
  expect((await liftedOutside()).lift?.type).toBe('pointerup');
  await scrollOneFinger(touch, box);

  // That fresh one-finger gesture disarms the pinch's ghost-click latch, unless a still-tracked
  // finger holds the count at two, which re-arms it on every pointerdown and eats every later tap.
  const swallowed = await zoomNode(page).evaluate((node) => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    node.dispatchEvent(event);
    return event.defaultPrevented;
  });

  expect(swallowed).toBe(false);
});

test('a mouse pinch is ignored', async ({ page }) => {
  await openSettingsReady(page);

  const { movePrevented } = await gestureOnPane(page, { fingers: 2, pointerType: 'mouse' });

  // A desktop uses the browser's own zoom; the pinch engages only real touch.
  expect(await paneZoom(page)).toBe(1);
  expect(movePrevented).toBe(false);
});

test('a table-of-contents jump keeps the zoom, because the wide pane is one document', async ({
  page,
}) => {
  const settings = await openSettingsReady(page);
  await pinchUntilZoomed(page);
  const zoomed = await paneZoom(page);
  const scroller = await paneScroller(page);

  // The sidebar only moves the scroll position within one continuous pane, so a jump is not landing
  // on a new section, and dropping the enlargement would shrink the text out from under the parent
  // who asked for it.
  await settings
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('button', { name: /^Sound/ })
    .click();

  await expect
    .poll(() =>
      scroller.evaluate((node) => {
        const heading = [...node.querySelectorAll('h3')].find(
          (candidate) => candidate.textContent === 'Sound'
        );
        return (
          (heading?.getBoundingClientRect().top ?? Infinity) - node.getBoundingClientRect().top
        );
      })
    )
    .toBeLessThan(SECTION_LANDED_MAX_PX);
  expect(await paneZoom(page)).toBe(zoomed);
});

test('drilling into a phone section resets the zoom', async ({ page }) => {
  // The phone shell still swaps one section in for another, so a parent never lands on a new section
  // still enlarged from the previous one.
  await page.setViewportSize(PHONE);
  await openSettingsReady(page);
  await pinchUntilZoomed(page);

  // The hub row sits inside the scroller the pinch ran on, so the first tap is eaten by the
  // ghost-click guard and the retry is the second, genuine one.
  await expect(async () => {
    await page.getByRole('button', { name: /^Tool Drawer/ }).click({ timeout: RETRY_STEP_MS });
    await expect(page.getByRole('dialog', { name: 'Tool Drawer' })).toBeVisible({
      timeout: RETRY_STEP_MS,
    });
  }).toPass();

  await expect.poll(() => paneZoom(page)).toBe(1);
});

// Dropping user-scalable=no reopens iOS Safari's focus-zoom on inputs whose font size is under 16px,
// which would zoom the visual viewport and strand the paper. Every input a parent can reach on the
// drawing screen must render at 16px or more.
test('parent-facing inputs on the drawing screen render at 16px or more', async ({ page }) => {
  await page.route('**/api/free-generation-grant', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' })
  );
  const settings = await openSettingsReady(page);
  const fontPx = (field: Locator) =>
    field.evaluate((node) => parseFloat(getComputedStyle(node).fontSize));

  await settings.getByRole('switch', { name: 'Create AI Images' }).click();
  const keyField = settings.getByRole('textbox', { name: 'OpenAI API Key' });
  await expect(keyField).toBeVisible();
  expect(await fontPx(keyField)).toBeGreaterThanOrEqual(MIN_FONT_PX);

  const report = settings.getByRole('textbox', { name: 'What went wrong?' });
  await report.scrollIntoViewIfNeeded();
  await expect(report).toBeVisible();
  expect(await fontPx(report)).toBeGreaterThanOrEqual(MIN_FONT_PX);
});

test('closing the overlay resets the zoom for the next open', async ({ page }) => {
  const settings = await openSettingsReady(page);
  await pinchUntilZoomed(page);

  await settings.getByRole('button', { name: 'Close' }).click();
  await expect(settings).toBeHidden();
  await openSettings(page);

  expect(await paneZoom(page)).toBe(1);
});

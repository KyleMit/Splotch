import { expect, test, type Page } from '@playwright/test';

// Tier-2 accessibility (ADR-0076): a low-vision parent can pinch to enlarge the
// Parent Center's reading content, while the drawing page itself stays
// zoom-locked. The pinchTextZoom action drives CSS `zoom` on a `.pc-zoom` wrapper
// inside the scrolling pane. The gesture math is unit-tested
// (pinchTextZoom.svelte.test.ts); this covers the action wiring — that two
// fingers enlarge and reset, that ONE finger is never intercepted (so native
// scrolling survives — the invariant the whole design rests on), that a
// non-touch pointer is ignored, and that navigating away resets the zoom.

async function openParentCenter(page: Page) {
  const modal = page.locator('#parentHelpModal');
  await expect(async () => {
    if (!(await modal.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: 'Parent Center' }).click({ timeout: 3000 });
    }
    await expect(modal).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 10_000 });
}

// Read the inline CSS `zoom` the action sets (blank/absent ⇒ normal size ⇒ 1).
async function paneZoom(page: Page): Promise<number> {
  return page.locator('.pc-zoom').evaluate((el) => {
    const z = (el as HTMLElement).style.zoom;
    return z === '' ? 1 : Number(z);
  });
}

// Fire a synthetic gesture on the content pane and report whether the action
// intercepted the move (called preventDefault — i.e. it took the gesture over
// from native scrolling). `fingers: 1` is a lone drag that must pass through;
// `fingers: 2` is a pinch spreading apart by `factor`. `pointerType: 'mouse'`
// must be ignored entirely (the action only engages real touch).
async function gestureOnPane(
  page: Page,
  opts: { fingers: 1 | 2; pointerType?: 'touch' | 'mouse'; factor?: number }
): Promise<{ movePrevented: boolean }> {
  return page
    .locator('.pc-pane, .pc-scroll')
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

test('a two-finger pinch enlarges the pane (and intercepts the gesture)', async ({ page }) => {
  await page.goto('/');
  await openParentCenter(page);

  expect(await paneZoom(page)).toBe(1);

  const { movePrevented } = await gestureOnPane(page, { fingers: 2, factor: 2 });
  expect(await paneZoom(page)).toBeGreaterThan(1);
  // A real pinch is taken over from native scrolling.
  expect(movePrevented).toBe(true);
});

test('a pinch swallows the trailing click, so it never toggles the control beneath it', async ({
  page,
}) => {
  await page.goto('/');
  await openParentCenter(page);

  // A two-finger gesture leaves the action primed to eat the primary finger's
  // click (which would otherwise open a section or flip a toggle under the
  // finger). Exactly one click is swallowed; the next is a real tap again.
  await gestureOnPane(page, { fingers: 2, factor: 2 });
  const { first, second } = await page
    .locator('.pc-pane, .pc-scroll')
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
  await page.goto('/');
  await openParentCenter(page);

  // Part 1: the action never intercepts a lone pointer (no zoom, no preventDefault).
  const { movePrevented } = await gestureOnPane(page, { fingers: 1 });
  expect(await paneZoom(page)).toBe(1);
  expect(movePrevented).toBe(false);

  // Part 2: and a *real* one-finger touch drag genuinely scrolls the pane — the
  // load-bearing invariant. Enlarge first so the content overflows, then drive
  // real compositor touch (not synthetic pointer events) via CDP: a future
  // `touch-action: none` on the pane or an ancestor would block this and fail
  // here, where the `movePrevented` check alone would sail past it.
  await page.locator('.pc-nav').getByRole('button', { name: 'Setup Guide' }).click();
  await gestureOnPane(page, { fingers: 2, factor: 3 });
  expect(await paneZoom(page)).toBeGreaterThan(1);

  const pane = page.locator('.pc-pane, .pc-scroll').first();
  const box = await pane.boundingBox();
  if (!box) throw new Error('pane not visible');
  const cx = box.x + box.width / 2;
  const yBottom = box.y + box.height * 0.8;
  const yTop = box.y + box.height * 0.2;

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', y: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x: cx, y }],
    });
  await touch('touchStart', yBottom);
  await touch('touchMove', (yBottom + yTop) / 2);
  await touch('touchMove', yTop);
  await touch('touchEnd', yTop);

  await expect
    .poll(() => pane.evaluate((el) => el.scrollTop), { timeout: 2000 })
    .toBeGreaterThan(0);
});

test('a non-touch (mouse) pinch is ignored', async ({ page }) => {
  await page.goto('/');
  await openParentCenter(page);

  const { movePrevented } = await gestureOnPane(page, { fingers: 2, pointerType: 'mouse' });
  // Desktop uses browser zoom; the action only engages real touch, so a
  // two-"finger" mouse gesture leaves the pane untouched.
  expect(await paneZoom(page)).toBe(1);
  expect(movePrevented).toBe(false);
});

test('navigating to another section resets the zoom', async ({ page }) => {
  await page.goto('/');
  await openParentCenter(page);

  await gestureOnPane(page, { fingers: 2, factor: 2 });
  expect(await paneZoom(page)).toBeGreaterThan(1);

  // Switching sections (resetKey: view) returns the pane to normal size, so a
  // parent never lands on a new section still enlarged from the previous one.
  await page.locator('.pc-nav').getByRole('button', { name: 'Sound' }).click();
  await expect.poll(() => paneZoom(page)).toBe(1);
});

// Regression guard for the tier-1 tradeoff: dropping user-scalable=no reopens
// iOS Safari's focus-zoom on inputs whose font-size is < 16px, which would zoom
// the visual viewport and strand the canvas (ADR-0076). Every focusable input
// reachable on the drawing route must render ≥ 16px.
test('parent-facing inputs on the drawing route render ≥16px (no iOS focus-zoom)', async ({
  page,
}) => {
  await page.goto('/');
  await openParentCenter(page);

  const fontPx = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

  await page.locator('.pc-nav').getByRole('button', { name: 'AI Art' }).click();
  await expect(page.locator('.access-code-input').first()).toBeVisible();
  expect(await fontPx('.access-code-input')).toBeGreaterThanOrEqual(16);

  await page.locator('.pc-nav').getByRole('button', { name: 'Submit Feedback' }).click();
  await expect(page.locator('.report-textarea')).toBeVisible();
  expect(await fontPx('.report-textarea')).toBeGreaterThanOrEqual(16);
});

test('closing the overlay resets the zoom for the next open', async ({ page }) => {
  await page.goto('/');
  await openParentCenter(page);

  await gestureOnPane(page, { fingers: 2, factor: 2 });
  expect(await paneZoom(page)).toBeGreaterThan(1);

  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('#parentHelpModal')).toBeHidden();
  await openParentCenter(page);
  expect(await paneZoom(page)).toBe(1);
});

import { expect, test } from '@playwright/test';
import { ACCEPT_RADIUS_FACTOR } from '../src/lib/actions/dragToClearGeometry';
import { gotoApp } from './helpers';

// Clear the threshold with margin so sub-pixel button geometry cannot land the release short.
const THRESHOLD_OVERSHOOT = 1.1;

// The drag-to-clear coachmark demos the gesture when a child taps the clear
// button repeatedly (or holds it) instead of dragging. Regression guard: the
// coachmark's own visibility ($state) was being read inside the
// orientation-reset $effect, so revealing it re-ran the effect and dismissed it
// in the same tick — the tutorial never actually appeared.

test('triple-tapping the clear button reveals the coachmark', async ({ page }) => {
  await gotoApp(page);

  const button = page.locator('#clearButton');
  const coachmark = page.locator('.clear-coachmark');

  // The coachmark only reveals when three taps land inside dragToClear's 1000ms
  // multi-click window; on a starved worker three separate Playwright clicks can
  // straddle that window and reset the count, so retry the whole burst until one
  // set lands in time rather than assuming a single burst always makes it.
  await expect(async () => {
    await button.click();
    await button.click();
    await button.click();
    await expect(coachmark).toHaveClass(/\bvisible\b/, { timeout: 1000 });
  }).toPass({ timeout: 15_000 });

  // The opacity poll settling above 0 confirms it actually painted (the
  // documented same-tick regression would keep it at 0).
  await expect
    .poll(() => coachmark.evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBeGreaterThan(0);
  // It must also *stay* up rather than being torn down a tick later — a
  // regression could dismiss it slightly after the reveal, not only in the same
  // tick. A short fixed settle then re-assert is the sanctioned "prove a
  // negative" wait (a slower worker only lengthens it, so it can't false-red),
  // not a flake-prone wait-for-something.
  await page.waitForTimeout(300);
  await expect(coachmark).toHaveClass(/\bvisible\b/);
});

test('the cleared button cannot re-arm its ring from the release point', async ({ page }) => {
  await gotoApp(page);

  const button = page.locator('#clearButton');
  const buttonBox = await button.boundingBox();
  const viewport = page.viewportSize();
  if (!buttonBox || !viewport) throw new Error('missing clear button box or viewport');

  const start = {
    x: buttonBox.x + buttonBox.width / 2,
    y: buttonBox.y + buttonBox.height / 2,
  };
  const acceptRadius = Math.min(viewport.width, viewport.height) * ACCEPT_RADIUS_FACTOR;
  const release = {
    x: start.x - (acceptRadius * THRESHOLD_OVERSHOOT) / Math.SQRT2,
    y: start.y + (acceptRadius * THRESHOLD_OVERSHOOT) / Math.SQRT2,
  };

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(release.x, release.y);
  await page.mouse.up();
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, release)).toBe(
    'drawingCanvas'
  );
  await page.mouse.down();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );

  await expect(page.locator('#clearAcceptZone')).not.toHaveClass(/\bvisible\b/);
  await page.mouse.up();
});

// The coachmark's keyframe loops must run only while it is VISIBLE. The base
// state hid it with opacity/visibility, neither of which pauses a CSS
// animation, so both fixed-position elements animated forever on every drawing
// session (the measured cost lives with the mechanism, in the component's
// style-block comment).
test('the hidden coachmark runs no animation; the revealed one does', async ({ page }) => {
  await gotoApp(page);

  const animationNames = () =>
    page.evaluate(() =>
      ['.coachmark-ring', '.coachmark-ghost'].map(
        (selector) => getComputedStyle(document.querySelector(selector)!).animationName
      )
    );

  expect(await animationNames()).toEqual(['none', 'none']);

  const button = page.locator('#clearButton');
  const coachmark = page.locator('.clear-coachmark');
  await expect(async () => {
    await button.click();
    await button.click();
    await button.click();
    await expect(coachmark).toHaveClass(/\bvisible\b/, { timeout: 1000 });
  }).toPass({ timeout: 15_000 });

  const running = await animationNames();
  expect(running.every((name) => name !== 'none')).toBe(true);
});

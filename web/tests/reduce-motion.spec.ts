import { expect, test, type Page } from '@playwright/test';

import { REDUCE_MOTION_ATTRIBUTE } from '../src/lib/platform/reducedMotion';
import { STORAGE_KEYS } from '../src/lib/storageKeys';
import { gotoApp, openSettingsModal } from './helpers';

// Reduce Motion (issue #2093) has two triggers — the Settings switch and the OS
// preference — resolved into one attribute on <html> that every reduced
// treatment keys off. These prove each trigger reaches the CSS cues and the JS
// callers alike, and that an explicit choice overrides the OS in both directions.

const root = (page: Page) => page.locator('html');

// The cues app.css styles globally, read off probe elements wearing the same
// classes the engine and the actions apply. Asserting the animated values at
// full motion first is what makes the reduced values mean something.
async function globalCues(page: Page) {
  return page.evaluate(() => {
    const probe = (element: string, className: string, open = false) => {
      const el = document.createElement(element);
      el.className = className;
      if (open) el.setAttribute('open', '');
      document.body.appendChild(el);
      const style = getComputedStyle(el);
      const read = { animationName: style.animationName, display: style.display };
      el.remove();
      return read;
    };
    return {
      undoSpin: probe('div', 'undo-firing').animationName,
      undoGhost: probe('div', 'undo-ink-motion').display,
      clearSheet: probe('div', 'clear-sheet-motion').display,
      unavailable: probe('div', 'action-unavailable').animationName,
      confirmFlyIn: probe('dialog', 'confirm-card modal-dialog modal-fly-in', true).animationName,
    };
  });
}

const FULL_MOTION_CUES = {
  undoSpin: 'undo-spin',
  undoGhost: 'block',
  clearSheet: 'block',
  unavailable: 'action-unavailable-shake, action-unavailable-flash',
  confirmFlyIn: 'dialogFlyFromOrigin',
};

const REDUCED_CUES = {
  undoSpin: 'none',
  undoGhost: 'none',
  clearSheet: 'none',
  unavailable: 'action-unavailable-flash',
  confirmFlyIn: 'confirmCardFadeIn',
};

// The Settings table-of-contents jump is one of the two JS callers of the
// effective answer: it glides at full motion and lands in one step when reduced.
const PANE_REST_POLL_MS = 100;
const JUMP_SETTLE_MS = 1500;

async function tocJumpSteps(page: Page) {
  return page.locator('.settings-pane').evaluate(
    async (pane, { restPollMs, settleMs }) => {
      const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      // An earlier glide still in flight would be counted as this jump's steps.
      for (let last = NaN; last !== pane.scrollTop; await pause(restPollMs)) last = pane.scrollTop;

      const seen = new Set<number>();
      const record = () => seen.add(Math.round(pane.scrollTop));
      pane.addEventListener('scroll', record);
      pane
        .closest('dialog')!
        .querySelector<HTMLElement>('.settings-nav [data-section="about"]')!
        .click();
      await pause(settleMs);
      pane.removeEventListener('scroll', record);
      return seen.size;
    },
    { restPollMs: PANE_REST_POLL_MS, settleMs: JUMP_SETTLE_MS }
  );
}

async function openAccessibility(page: Page) {
  await openSettingsModal(page);
  await page.locator('.settings-nav').getByRole('button', { name: 'Accessibility' }).click();
  const toggle = page.getByRole('switch', { name: 'Reduce Motion' });
  await expect(toggle).toBeInViewport();
  return toggle;
}

test('the switch reduces every covered cue while the OS has no preference', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await gotoApp(page);
  await expect(root(page)).not.toHaveAttribute(REDUCE_MOTION_ATTRIBUTE);
  expect(await globalCues(page)).toEqual(FULL_MOTION_CUES);

  const toggle = await openAccessibility(page);
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(
    page.getByText('Calmer screens help children who are sensitive to movement')
  ).toBeVisible();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(root(page)).toHaveAttribute(REDUCE_MOTION_ATTRIBUTE);
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.reduceMotion)).toBe(
    'reduce'
  );
  expect(await globalCues(page)).toEqual(REDUCED_CUES);
  expect(await tocJumpSteps(page)).toBe(1);
});

test('the OS preference reduces the same cues and the switch reads as on', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoApp(page);
  await expect(root(page)).toHaveAttribute(REDUCE_MOTION_ATTRIBUTE);
  expect(await globalCues(page)).toEqual(REDUCED_CUES);

  const toggle = await openAccessibility(page);
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  expect(
    await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.reduceMotion)
  ).toBeNull();
});

test('turning the switch off overrides a reduce-motion OS, across a reload', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoApp(page);
  const toggle = await openAccessibility(page);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(root(page)).not.toHaveAttribute(REDUCE_MOTION_ATTRIBUTE);
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEYS.reduceMotion)).toBe(
    'full'
  );
  expect(await globalCues(page)).toEqual(FULL_MOTION_CUES);

  await gotoApp(page);
  await expect(root(page)).not.toHaveAttribute(REDUCE_MOTION_ATTRIBUTE);
  await openSettingsModal(page);
  expect(await tocJumpSteps(page)).toBeGreaterThan(3);
});

test('a returning device is stamped before hydration', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(
    ([key]) => localStorage.setItem(key, 'reduce'),
    [STORAGE_KEYS.reduceMotion]
  );
  // The attribute as the first stylesheet-blocked paint would see it: recorded
  // by a script that runs before any of the page's own, read at DOMContentLoaded.
  await page.addInitScript((attribute) => {
    document.addEventListener('DOMContentLoaded', () => {
      (window as Window & { __stampedAtLoad?: boolean }).__stampedAtLoad =
        document.documentElement.hasAttribute(attribute);
    });
  }, REDUCE_MOTION_ATTRIBUTE);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(
    await page.evaluate(() => (window as Window & { __stampedAtLoad?: boolean }).__stampedAtLoad)
  ).toBe(true);
});

test('a live OS switch restamps in system mode, on a route with no appearance state', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/privacy');
  await expect(root(page)).not.toHaveAttribute(REDUCE_MOTION_ATTRIBUTE);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(root(page)).toHaveAttribute(REDUCE_MOTION_ATTRIBUTE);

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(root(page)).not.toHaveAttribute(REDUCE_MOTION_ATTRIBUTE);
});

test('the parental gate fades in, a component-scoped treatment, under the switch', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(
    ([key]) => localStorage.setItem(key, 'reduce'),
    [STORAGE_KEYS.reduceMotion]
  );
  await gotoApp(page, '/', { gates: 'always' });

  await openSettingsModal(page);
  const gate = page.locator('#parentalGate');
  await expect(async () => {
    await page.locator('.settings-nav [data-section="parentCenter"]').click({ timeout: 1000 });
    await expect(gate).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  expect(await gate.evaluate((el) => getComputedStyle(el).animationName)).toContain('gateFadeIn');
});

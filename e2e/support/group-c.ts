// Helpers the group C ports share (#3156): the specs ported from web/tests that cover Settings, the
// install banner, browser history and the information pages. A helper only one spec uses stays in
// that spec.
import { expect, type Locator, type Page } from '@playwright/test';
import { BROWSER_BACK_STATE_KEY } from '../../src/product/browserBack.ts';

// The user agents the app's device detection reads (install/installPolicy.ts). A spec picks one
// with `test.use`; the project's own desktop agent covers the third case.
export const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36';
export const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
// Chrome on iOS: an iOS device whose Share sheet is not the one the manual install steps describe.
export const IPHONE_CHROME_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124 Mobile/15E148 Safari/604.1';

// How long a dialog gets to open or close, covering its fly-in on a starved CI runner.
const DIALOG_TIMEOUT_MS = 10_000;
// One attempt at closing the dialogs that are open, short enough that a retry loop gets several.
const DIALOG_STEP_MS = 1_000;

/** Presses the Settings button and answers the dialog it opens. */
export async function openSettings(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible({ timeout: DIALOG_TIMEOUT_MS });
  return dialog;
}

const SETTLE_POLLS = 3;
const SETTLE_POLL_MS = 100;

/**
 * A control's box once three polls in a row agree on it, for a control inside a card that flies
 * in, which is measured against its final place rather than a moment of its motion.
 */
export async function settledBox(locator: Locator) {
  let previous = '';
  let agreeing = 0;
  await expect
    .poll(
      async () => {
        const box = JSON.stringify(await locator.boundingBox());
        agreeing = box === previous ? agreeing + 1 : 0;
        previous = box;
        return agreeing >= SETTLE_POLLS;
      },
      { intervals: [SETTLE_POLL_MS] }
    )
    .toBe(true);
  return JSON.parse(previous) as { x: number; y: number; width: number; height: number };
}

/** What the app's browser-history owner holds for the current entry above the page itself. */
export type BackLayers = { guard: boolean; dialogs: number };

const GUARD_LAYER = 'guard';
const DIALOG_LAYER_PREFIX = 'dialog:';

/** The history owner's layers for the current entry, or null while no owner has marked it. */
function backLayers(page: Page): Promise<BackLayers | null> {
  return page.evaluate(
    ({ key, guard, dialogPrefix }) => {
      const marker: unknown = history.state?.[key];
      if (typeof marker !== 'object' || marker === null || !('layers' in marker)) return null;
      if (!Array.isArray(marker.layers)) return null;
      const layers = marker.layers.map(String);
      return {
        guard: layers.includes(guard),
        dialogs: layers.filter((layer) => layer.startsWith(dialogPrefix)).length,
      };
    },
    { key: BROWSER_BACK_STATE_KEY, guard: GUARD_LAYER, dialogPrefix: DIALOG_LAYER_PREFIX }
  );
}

/** Asserts the history owner's layers, polling while a Back traversal settles. */
export async function expectBackLayers(page: Page, expected: BackLayers) {
  await expect.poll(() => backLayers(page)).toEqual(expected);
}

/**
 * Draws one short stroke on row `row` of the paper, counting from the top, without measuring
 * pixels. Rows are 0.07 of the paper's height apart, so strokes never share a row.
 */
export async function drawRowStroke(page: Page, paper: Locator, row: number) {
  const box = await paper.boundingBox();
  if (!box) throw new Error('The drawing paper is not laid out');
  const y = box.y + box.height * (0.12 + 0.07 * row);
  await page.mouse.move(box.x + box.width * 0.3, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, y + 12, { steps: 8 });
  await page.mouse.up();
}

/**
 * Puts the page in element fullscreen with a keypress, which carries the user activation the
 * browser asks for and which the app binds nothing to. A touch browser honours an orientation lock
 * only in this state, so the Orientation picker renders only here. The viewport keeps its size.
 * Navigating leaves fullscreen.
 */
export async function enterFullscreen(page: Page) {
  await page.evaluate(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'F2') return;
      document.removeEventListener('keydown', onKey, true);
      void document.documentElement.requestFullscreen();
    };
    document.addEventListener('keydown', onKey, true);
  });
  await page.keyboard.press('F2');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
}

/**
 * Leaves element fullscreen. Chromium backs it with a fullscreen window and then refuses
 * `setViewportSize`, so a case that measures a second viewport exits between them.
 */
export async function exitFullscreen(page: Page) {
  await page.evaluate(() => (document.fullscreenElement ? document.exitFullscreen() : undefined));
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
}

const PARENT_CENTER_CHECK = 'Opening Parent Center parental gate frequency';

/**
 * Sets the grown-up check on Parent Center to Every time, in whichever Settings shell the window
 * gets, and closes Settings. The web starts every check on Never, so Parent Center opens with no
 * gate.
 */
export async function armParentCenterGate(page: Page) {
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: /^Parent Center/ }).click();
  await page
    .getByRole('radiogroup', { name: PARENT_CENTER_CHECK })
    .getByRole('radio', { name: 'Every time' })
    .click();
  // The phone shell stacks a section dialog over Settings, so Escape closes one dialog per press.
  await expect(async () => {
    if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: DIALOG_STEP_MS });
  }).toPass();
}

/** Answers the multiplication problem on the open Grown-Ups Only gate, and waits for it to close. */
export async function solveParentGate(page: Page) {
  const gate = page.getByRole('dialog', { name: 'Grown-Ups Only' });
  const problem = await gate
    .getByRole('img', { name: /^What is \d times \d\?$/ })
    .getAttribute('aria-label');
  const factors = /^What is (\d) times (\d)\?$/.exec(problem ?? '');
  if (!factors) throw new Error(`The gate asked "${problem}"`);
  const answer = String(Number(factors[1]) * Number(factors[2]));
  for (const digit of answer) await gate.getByRole('button', { name: digit, exact: true }).click();
  await gate.getByRole('button', { name: 'Check answer' }).click();
  await expect(gate).toBeHidden({ timeout: DIALOG_TIMEOUT_MS });
}

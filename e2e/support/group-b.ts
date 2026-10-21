import { expect, type Locator, type Page } from '@playwright/test';
import sharp from 'sharp';
import { PAPER_INPUT_TEST_ID } from '../../experiments/native-architecture/src/platform/firstFrameContract.ts';

// Helpers the group B specs share. The suite's common helpers (fixtures.ts, support/app.ts,
// support/drawing.ts) belong to no one lane, so a helper two or more of these specs use lives here.

const RGBA_CHANNELS = 4;
// A pixel counts as black ink when every channel is below this. The light paper's grain and the
// coloured chrome stay far above it; Black ink on the light theme sits near zero.
const BLACK_INK_CHANNEL_MAX = 80;
// Pale enough that no paper grain reaches it, and no coloured ink either.
const WHITE_INK_CHANNEL_MIN = 235;
// How far one channel must lead the others for a pixel to read as that hue. Antialiased edges blend
// toward the paper and fall short of it; the stroke's body clears it by a wide margin.
const DOMINANT_MARGIN = 60;
// A pixel is vivid, rather than paper, grey or black, when it is this bright with this much
// spread between its strongest and weakest channel.
const VIVID_BRIGHTNESS_MIN = 100;
const VIVID_SPREAD_MIN = 30;
const FULL_TURN_DEGREES = 360;
const DEGREES_PER_SEXTANT = 60;
const HUE_SECTORS = 6;
// A sector carries ink once this many vivid pixels fall in it, so antialiased fringes and the odd
// stray pixel do not count as a colour.
const HUE_SECTOR_MIN_PIXELS = 40;
// The paper's central band, as fractions of its box. The corner controls and the bottom toolbar
// overlap the paper's edges, so measuring inside the band keeps chrome out of an ink count.
const CENTRAL_BAND = { left: 0.15, top: 0.1, right: 0.85, bottom: 0.75 } as const;
const CLEAR_DRAG_STEPS = 12;
const REACT_PROPS_KEY = '__reactProps$';

/** Decides whether one pixel's red, green and blue channels read as the ink a spec looks for. */
export type InkColor = (red: number, green: number, blue: number) => boolean;

export const BLACK_INK: InkColor = (red, green, blue) =>
  Math.max(red, green, blue) < BLACK_INK_CHANNEL_MAX;
// Black ink on the dark theme is drawn white, on paper far darker than any channel here.
export const WHITE_INK: InkColor = (red, green, blue) =>
  Math.min(red, green, blue) > WHITE_INK_CHANNEL_MIN;
export const BLUE_INK: InkColor = (red, green, blue) =>
  blue > red + DOMINANT_MARGIN && blue > green + DOMINANT_MARGIN / 2;
export const RED_INK: InkColor = (red, green, blue) =>
  red > green + DOMINANT_MARGIN && red > blue + DOMINANT_MARGIN;
export const GREEN_INK: InkColor = (red, green, blue) =>
  green > red + DOMINANT_MARGIN && green > blue + DOMINANT_MARGIN / 2;

/** The paper's central band as raw RGBA, read off a screenshot of the page as drawn. */
async function centralBandPixels(page: Page): Promise<Buffer> {
  const box = await page.getByTestId(PAPER_INPUT_TEST_ID).boundingBox();
  if (!box) throw new Error('The drawing paper is not laid out');
  const png = await page.screenshot({
    clip: {
      x: box.x + box.width * CENTRAL_BAND.left,
      y: box.y + box.height * CENTRAL_BAND.top,
      width: box.width * (CENTRAL_BAND.right - CENTRAL_BAND.left),
      height: box.height * (CENTRAL_BAND.bottom - CENTRAL_BAND.top),
    },
  });
  return sharp(png).ensureAlpha().raw().toBuffer();
}

/** Pixels of one ink colour in the paper's central band. */
export async function inkInCentralBand(page: Page, isInk: InkColor): Promise<number> {
  const pixels = await centralBandPixels(page);
  let count = 0;
  for (let offset = 0; offset < pixels.length; offset += RGBA_CHANNELS) {
    if (isInk(pixels[offset], pixels[offset + 1], pixels[offset + 2])) count++;
  }
  return count;
}

/** The hue in degrees of a vivid pixel, or null for paper, grey and black. */
function vividHue(red: number, green: number, blue: number): number | null {
  const high = Math.max(red, green, blue);
  const spread = high - Math.min(red, green, blue);
  if (high < VIVID_BRIGHTNESS_MIN || spread < VIVID_SPREAD_MIN) return null;
  let sextants: number;
  if (high === red) sextants = (green - blue) / spread;
  else if (high === green) sextants = (blue - red) / spread + 2;
  else sextants = (red - green) / spread + 4;
  return (sextants * DEGREES_PER_SEXTANT + FULL_TURN_DEGREES) % FULL_TURN_DEGREES;
}

/**
 * How many sectors of the colour wheel carry vivid ink in the paper's central band. A pen stroke
 * is one hue however long it is; the magic brush reveals the page's own colours, or a rainbow on a
 * blank page, so it reaches several.
 */
export async function inkHuesInCentralBand(page: Page): Promise<number> {
  const pixels = await centralBandPixels(page);
  const populations = new Array<number>(HUE_SECTORS).fill(0);
  for (let offset = 0; offset < pixels.length; offset += RGBA_CHANNELS) {
    const hue = vividHue(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
    if (hue !== null) populations[Math.floor((hue / FULL_TURN_DEGREES) * HUE_SECTORS)]++;
  }
  return populations.filter((pixelCount) => pixelCount >= HUE_SECTOR_MIN_PIXELS).length;
}

/** Black ink pixels in the paper's central band. */
export function blackInkInCentralBand(page: Page): Promise<number> {
  return inkInCentralBand(page, BLACK_INK);
}

/** Drags the Clear control toward the middle of the screen, past where it commits, and lets go. */
export async function clearByDragging(page: Page): Promise<void> {
  const box = await page.getByRole('button', { name: 'Clear drawing' }).boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error('The Clear control or the viewport is not measurable');
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let step = 1; step <= CLEAR_DRAG_STEPS; step++) {
    await page.mouse.move(
      startX + ((viewport.width / 2 - startX) * step) / CLEAR_DRAG_STEPS,
      startY + ((viewport.height / 2 - startY) * step) / CLEAR_DRAG_STEPS
    );
  }
  await page.mouse.up();
}

/** Opens the drawer if it is closed, so its buttons are reachable. */
export async function openDrawer(page: Page): Promise<void> {
  const expand = page.getByRole('button', { name: 'Expand controls' });
  if (await expand.isVisible()) await expand.click();
  await expect(page.getByRole('button', { name: 'Collapse controls' })).toBeVisible();
}

/** The Undo button, which lives in the drawer. */
export function undoButton(page: Page): Locator {
  return page.getByRole('button', { name: 'Undo', exact: true });
}

/**
 * Waits until React has taken over the element a locator names. A page document paints its
 * prerendered markup first, where a press or a typed letter lands on nothing and is lost when the
 * app mounts over it; React marks every element it manages with a props key once it has.
 */
export async function waitForHydration(target: Locator): Promise<void> {
  await expect
    .poll(() =>
      target.evaluate(
        (node, prefix) => Object.keys(node).some((key) => key.startsWith(prefix)),
        REACT_PROPS_KEY
      )
    )
    .toBe(true);
}

/** The Grown-Ups Only card. */
export function gateCard(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Grown-Ups Only' });
}

/** The two numbers the Grown-Ups Only card asks for the product of, read from its label. */
async function gateOperands(page: Page): Promise<[number, number]> {
  const label = await gateCard(page)
    .getByLabel(/What is \d+ times \d+\?/)
    .first()
    .getAttribute('aria-label');
  const operands = label?.match(/\d+/g)?.map(Number);
  if (operands?.length !== 2) throw new Error(`The gate asked an unreadable question: ${label}`);
  return [operands[0], operands[1]];
}

/**
 * Types an answer on the card's keypad and checks it. A paused keypad marks its keys disabled, which
 * Playwright's own click waits out forever, so a press at one under test is forced.
 */
export async function answerGate(
  page: Page,
  answer: string,
  keypad: 'ready' | 'paused' = 'ready'
): Promise<void> {
  const card = gateCard(page);
  const force = keypad === 'paused';
  for (const digit of answer) {
    await card.getByRole('button', { name: digit, exact: true }).click({ force });
  }
  await card.getByRole('button', { name: 'Check answer', exact: true }).click({ force });
}

/** Solves the card's problem. */
export async function solveGate(page: Page, keypad: 'ready' | 'paused' = 'ready'): Promise<void> {
  const [x, y] = await gateOperands(page);
  await answerGate(page, String(x * y), keypad);
}

/** A guaranteed wrong answer with as many digits as the right one, so the keypad takes it all. */
export async function wrongGateAnswer(page: Page): Promise<string> {
  const [x, y] = await gateOperands(page);
  const right = String(x * y);
  // No product of two single digits is 99, and the one-digit product nine gets an eight instead.
  return right === '9' ? '8' : '9'.repeat(right.length);
}

/** The radio group that holds one feature's Grown-Ups Only policy, in the open Settings dialog. */
export function gatePolicy(settings: Locator, feature: string): Locator {
  return settings.getByRole('radiogroup', { name: `${feature} parental gate frequency` });
}

/**
 * Turns each named feature's Grown-Ups Only check to a mode through Settings' Parent Center, then
 * closes Settings. Parent Center's own check stays off, so the pane opens unasked.
 */
export async function setGatePolicies(
  page: Page,
  mode: 'Every time' | 'Per session',
  features: readonly string[]
): Promise<void> {
  const settings = await openSettings(page);
  await goToSettingsSection(settings, 'Parent Center');
  for (const feature of features) {
    await gatePolicy(settings, feature).getByRole('radio', { name: mode, exact: true }).click();
  }
  await closeDialog(settings);
}

/**
 * Presses the middle of a control with the mouse once it has stopped moving. A control that sits
 * under a gesture surface (the colour picker's hexagons) refuses Playwright's own click for being
 * covered, but takes a press at its coordinates as a finger would, and a press that lands while the
 * dialog is still flying in picks a different one.
 */
export async function pressWhereItSettles(page: Page, target: Locator): Promise<void> {
  let previous = '';
  await expect
    .poll(async () => {
      const box = JSON.stringify(await target.boundingBox());
      const settled = box === previous;
      previous = box;
      return settled;
    })
    .toBe(true);
  const box = await target.boundingBox();
  if (!box) throw new Error('The control to press is not laid out');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/** Opens Settings and answers its dialog. */
export async function openSettings(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Jumps Settings to one section through its table of contents. */
export async function goToSettingsSection(dialog: Locator, section: string): Promise<void> {
  await dialog
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('button', { name: section, exact: true })
    .click();
}

/** Closes a dialog by its Close button and waits for it to go. */
export async function closeDialog(dialog: Locator): Promise<void> {
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toBeHidden();
}

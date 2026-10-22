// Helpers the group A specs share (ported from web/tests, issue 3154). The suite's common helpers
// are fixtures.ts, support/app.ts and support/drawing.ts; a helper only one spec uses stays in
// that spec.
import { expect, type Download, type Locator, type Page } from '@playwright/test';
import sharp from 'sharp';
import { ADMIN_SESSION_KEY } from '../../src/pageDocument/admin/adminContract.ts';
import { test as base } from '../fixtures.ts';
import { ADMIN_ACCESS_TOKEN, MANAGED_ACCESS_CODE } from '../server/serverEnv.ts';
import { waitForDrawingScreen } from './app.ts';
import type { DrawingScreen } from './drawing.ts';

export const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36';
export const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

// React stamps a node with its props once it has hydrated the node, and a prerendered page answers
// no click until then. The pages carry no other signal that their handlers are in.
const REACT_PROPS_KEY_PREFIX = '__reactProps$';

/** Waits until React has taken over the element, so a click on it reaches its handler. */
export async function expectWired(element: Locator): Promise<void> {
  await expect
    .poll(
      () =>
        element.evaluate(
          (node, prefix) => Object.keys(node).some((key) => key.startsWith(prefix)),
          REACT_PROPS_KEY_PREFIX
        ),
      { message: 'React has not hydrated the element' }
    )
    .toBe(true);
}

// A dialog or card that flies in keeps moving for a few frames; a measurement or a scan taken
// mid-flight reads positions and colours that are not the settled ones.
const SETTLE_POLL_INTERVAL_MS = 100;
const SETTLE_STABLE_READS = 3;

/** Waits until the element's box has held still for a few consecutive reads. */
export async function expectSettled(element: Locator): Promise<void> {
  let previous = '';
  let stableReads = 0;
  await expect
    .poll(
      async () => {
        const box = await element.boundingBox();
        const current = JSON.stringify(box);
        stableReads = box !== null && current === previous ? stableReads + 1 : 0;
        previous = current;
        await element.page().waitForTimeout(SETTLE_POLL_INTERVAL_MS);
        return stableReads >= SETTLE_STABLE_READS;
      },
      { message: 'the element is still moving' }
    )
    .toBe(true);
}

/** Waits until the element's ink and fill have stopped changing, as a transition ends. */
export async function expectColorsSettled(element: Locator): Promise<void> {
  let previous = '';
  let stableReads = 0;
  await expect
    .poll(
      async () => {
        const current = await element.evaluate((node) => {
          const style = getComputedStyle(node);
          return `${style.color}|${style.backgroundColor}|${style.opacity}`;
        });
        stableReads = current === previous ? stableReads + 1 : 0;
        previous = current;
        await element.page().waitForTimeout(SETTLE_POLL_INTERVAL_MS);
        return stableReads >= SETTLE_STABLE_READS;
      },
      { message: 'the element is still changing colour' }
    )
    .toBe(true);
}

// The departing page flies across the paper before the paper is bare, so a first read of "no ink"
// can land before the flight begins. A cleared page is one that reads bare and stays bare.
const CLEARED_SETTLE_MS = 1500;

/** Waits for a stroke to be gone from the paper, and for it to stay gone once the page has flown. */
export async function expectPaperCleared(
  screen: DrawingScreen,
  stroke: Parameters<DrawingScreen['inkedPixels']>[0]
): Promise<void> {
  await expect.poll(() => screen.inkedPixels(stroke)).toBe(0);
  await screen.page.waitForTimeout(CLEARED_SETTLE_MS);
  expect(await screen.inkedPixels(stroke)).toBe(0);
}

// A region of the screen measured against how it looked before something drew on it, for the specs
// that put ink down through their own input rather than the drawing helpers' mouse.
export type ScreenRegion = { x: number; y: number; width: number; height: number };
const RGB_CHANNELS = 3;
const INK_CHANNEL_DELTA = 48;
const REGION_PADDING_PX = 24;

/** The screen rectangle that holds the segment between two points, padded past a brush's width. */
export function regionBetween(
  from: { x: number; y: number },
  to: { x: number; y: number }
): ScreenRegion {
  return {
    x: Math.min(from.x, to.x) - REGION_PADDING_PX,
    y: Math.min(from.y, to.y) - REGION_PADDING_PX,
    width: Math.abs(from.x - to.x) + 2 * REGION_PADDING_PX,
    height: Math.abs(from.y - to.y) + 2 * REGION_PADDING_PX,
  };
}

/** The region's pixels as they are now, to measure ink against later. */
export async function regionPixels(page: Page, region: ScreenRegion): Promise<Buffer> {
  return sharp(await page.screenshot({ clip: region }))
    .removeAlpha()
    .raw()
    .toBuffer();
}

/** How many pixels differ markedly between two captures of the same region. */
export function pixelsInkedBetween(before: Buffer, after: Buffer): number {
  let inked = 0;
  for (let offset = 0; offset < before.length; offset += RGB_CHANNELS) {
    const delta = Math.max(
      Math.abs(before[offset] - after[offset]),
      Math.abs(before[offset + 1] - after[offset + 1]),
      Math.abs(before[offset + 2] - after[offset + 2])
    );
    if (delta > INK_CHANNEL_DELTA) inked++;
  }
  return inked;
}

/** How many pixels of the region differ markedly from `before`. */
export async function inkedPixelsSince(
  page: Page,
  region: ScreenRegion,
  before: Buffer
): Promise<number> {
  return pixelsInkedBetween(before, await regionPixels(page, region));
}

/** The screen rectangle an element covers now. */
export async function regionOf(element: Locator): Promise<ScreenRegion> {
  const box = await element.boundingBox();
  if (!box) throw new Error('The element is not laid out');
  return box;
}

// Seven books of a few megabytes each are fetched and stored one after another; a hosted runner
// stores about one every four seconds, so the whole set takes the better part of half a minute.
export const ALL_BOOKS_STORED_TIMEOUT_MS = 60_000;
export const ALL_BOOKS_STORED_TEST_TIMEOUT_MS = 90_000;

export type BrushName = 'Pen' | 'Crayon' | 'Magic brush' | 'Eraser';

/** Opens the tool drawer when it is folded; the drawer's own buttons answer once it is open. */
export async function openDrawer(page: Page): Promise<void> {
  const expand = page.getByRole('button', { name: 'Expand controls' });
  if (await expand.isVisible()) await expand.click();
  await expect(page.getByRole('button', { name: 'Collapse controls' })).toBeVisible();
}

const DOWNLOAD_TIMEOUT_MS = 15_000;
// A pixel this dark is the black stroke a spec drew, never the paper's grain.
const SAVED_INK_MAX_CHANNEL = 60;

/** Saves the picture from the drawer and answers the PNG the browser downloads. */
export async function savePicture(page: Page): Promise<Download> {
  await openDrawer(page);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: DOWNLOAD_TIMEOUT_MS }),
    page.getByRole('button', { name: 'Save screenshot', exact: true }).click(),
  ]);
  return download;
}

/** How many pixels of a saved picture are dark enough to be a black stroke. */
export async function inkInSavedPicture(download: Download): Promise<number> {
  const { data } = await sharp(await download.path())
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let inked = 0;
  for (let offset = 0; offset < data.length; offset += RGB_CHANNELS)
    if (Math.max(data[offset], data[offset + 1], data[offset + 2]) < SAVED_INK_MAX_CHANNEL) inked++;
  return inked;
}

/** Picks a brush from the drawer's Brushes menu and waits for the menu to name it pressed. */
export async function chooseBrush(page: Page, brush: BrushName): Promise<void> {
  await openDrawer(page);
  await page.getByRole('button', { name: 'Brushes', exact: true }).click();
  const menu = page.getByRole('group', { name: 'Brush Menu' });
  await menu.getByRole('button', { name: brush, exact: true }).click();
  await expect(menu.getByRole('button', { name: brush, exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
}

/**
 * Opens one of Settings' sections and answers the dialog that holds it. The wide layout shows the
 * section inside Settings under its title; the phone's hub names it with what it currently says
 * ("Appearance, Night Mode · portrait lock") and opens it as a dialog of its own.
 */
export async function openSettingsSection(page: Page, title: string): Promise<Locator> {
  const settings = await openSettings(page);
  await settings
    .getByRole('button', { name: new RegExp(`^${title}(,|$)`) })
    .first()
    .click();
  const holder = page.getByRole('dialog', { name: new RegExp(`^(Settings|${title})$`) });
  await expect(holder).toBeVisible();
  return holder;
}

/** Opens Settings and answers its dialog. */
export async function openSettings(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  await expect(dialog).toBeVisible();
  await expectSettled(dialog);
  return dialog;
}

const ADMIN_PATH = '/admin';
const ADMIN_LOGIN_PATH = '/api/admin/login';

/** The signed-in console's heading, which names how many access codes it lists. */
export const ADMIN_CODE_HEADING = /^Access codes/;

export function adminSignInForm(page: Page) {
  return {
    key: page.getByPlaceholder('Admin access key'),
    submit: page.getByRole('button', { name: 'Sign in', exact: true }),
  };
}

type AdminFixtures = { adminPage: Page };
type AdminWorkerFixtures = { adminSession: string };

// The server throttles sign-ins to ten a minute, so a worker signs in once, through the API, and
// every test that needs the console opens it with that session in storage, as a returning owner's
// browser holds it. A spec about signing in goes through the form instead.
export const test = base.extend<AdminFixtures, AdminWorkerFixtures>({
  adminSession: [
    async ({ playwright }, use, workerInfo) => {
      const api = await playwright.request.newContext({ baseURL: workerInfo.project.use.baseURL });
      const answer = await api.post(ADMIN_LOGIN_PATH, { data: { key: ADMIN_ACCESS_TOKEN } });
      expect(answer.status(), 'the admin sign-in').toBe(200);
      const { session } = (await answer.json()) as { session: string };
      await api.dispose();
      await use(session);
    },
    { scope: 'worker' },
  ],
  adminPage: async ({ page, adminSession }, use) => {
    await page.addInitScript(
      ([key, session]) => localStorage.setItem(key, session),
      [ADMIN_SESSION_KEY, adminSession]
    );
    await page.goto(ADMIN_PATH);
    await expect(page.getByRole('heading', { name: ADMIN_CODE_HEADING })).toBeVisible();
    await use(page);
  },
});

// What a stubbed generation answers with: the wire contract's image reply or its refusals.
// The model key the suite's server holds cannot authenticate, so a spec that needs a picture
// stands in for the endpoint below the client pipeline: canvas export, upload encoding, response
// parsing and the result's presentation all still run.
const GENERATE_IMAGE_ROUTE = '**/api/generate-image*';
const PICTURE_SIZE = { width: 800, height: 600 };
const PICTURE_BACKGROUND = '#d85a8c';
export const MOCK_REPORT_TOKEN = '9999999999999.mock-signature';
const REPORT_TOKEN_HEADER = 'X-Report-Token';
const SAFETY_REFUSAL_STATUS = 422;
const AI_REQUEST_TIMEOUT_MS = 15_000;

type AiStroke = Awaited<ReturnType<DrawingScreen['drawStroke']>>;

type AiUpload = {
  method: string;
  path: string;
  contentType: string | undefined;
  body: Buffer;
  accessToken: string | undefined;
};

type AiDelivery = {
  response: {
    status: number;
    contentType: string;
    body: string | Buffer;
    headers?: Record<string, string>;
  };
  delivered: () => void;
};

export type AiEndpoint = {
  requests: AiUpload[];
  /** Resolves once the first (or next unseen) generation request has reached the stub. */
  requestSeen: (count?: number) => Promise<void>;
  /** Answers the oldest waiting generation with a picture. */
  succeed: (headers?: Record<string, string>) => Promise<void>;
  /** Answers it with a refusal; 422 is the safety refusal and carries a report token. */
  fail: (status?: number) => Promise<void>;
};

/** Holds every generation request until the spec answers it, as the model provider would. */
export async function stubAiEndpoint(page: Page): Promise<AiEndpoint> {
  const picture = await sharp({
    create: { ...PICTURE_SIZE, channels: 3, background: PICTURE_BACKGROUND },
  })
    .jpeg()
    .toBuffer();
  const queued: AiDelivery[] = [];
  const waiters: ((delivery: AiDelivery) => void)[] = [];
  const requests: AiUpload[] = [];
  const respond = (response: AiDelivery['response']) =>
    new Promise<void>((delivered) => {
      const delivery = { response, delivered };
      const waiter = waiters.shift();
      if (waiter) waiter(delivery);
      else queued.push(delivery);
    });

  await page.route(GENERATE_IMAGE_ROUTE, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push({
      method: request.method(),
      path: `${url.pathname}${url.search}`,
      contentType: request.headers()['content-type'],
      body: request.postDataBuffer() ?? Buffer.alloc(0),
      accessToken: request.headers()['x-access-token'],
    });
    const delivery =
      queued.shift() ??
      (await new Promise<AiDelivery>((resolve) => {
        waiters.push(resolve);
      }));
    try {
      await route.fulfill(delivery.response);
    } finally {
      delivery.delivered();
    }
  });

  return {
    requests,
    requestSeen: (count = 1) =>
      expect
        .poll(() => requests.length, { timeout: AI_REQUEST_TIMEOUT_MS })
        .toBeGreaterThanOrEqual(count),
    succeed: (headers) =>
      respond({ status: 200, contentType: 'image/jpeg', body: picture, headers }),
    fail: (status = 500) =>
      respond({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'Mock generation failure' }),
        headers:
          status === SAFETY_REFUSAL_STATUS
            ? { [REPORT_TOKEN_HEADER]: MOCK_REPORT_TOKEN }
            : undefined,
      }),
  };
}

const FREE_GRANT_ROUTE = '**/api/free-generation-grant';
const FREE_GENERATION_LIMIT = 10;

/**
 * Answers the free allowance check with a full allowance. The suite's server has no Netlify Blobs,
 * so the real function cannot mint a grant and the free tier would read as unavailable.
 */
export async function stubFreeGrant(page: Page): Promise<void> {
  await page.route(FREE_GRANT_ROUTE, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        remaining: FREE_GENERATION_LIMIT,
        limit: FREE_GENERATION_LIMIT,
      }),
    })
  );
}

/** The address a managed access code's invite link opens. */
const INVITE_PATH = `/?ai_access_token=${MANAGED_ACCESS_CODE}`;

/** Opens the drawing through an invite link and turns AI pictures on in Settings. */
export async function enableAi(screen: DrawingScreen): Promise<void> {
  const { page } = screen;
  await page.goto(INVITE_PATH);
  await waitForDrawingScreen(page);
  const settings = await openSettings(page);
  await settings.getByRole('switch', { name: 'Create AI Images' }).click();
  await expect(settings.getByRole('switch', { name: 'Create AI Images' })).toBeChecked();
  await settings.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(settings).toBeHidden();
}

/** The drawer's button that makes, shows or reopens an AI picture. */
export function aiImageButton(page: Page): Locator {
  return page.getByRole('button', {
    name: /^(Create AI image(, \d+ free left)?|Show the picture being made|Show your finished picture|Show what didn't work)$/,
  });
}

/** Draws a stroke, asks for a Magical picture, and answers with the result dialog and the stroke. */
export async function startAiGeneration(
  screen: DrawingScreen,
  colorName = 'Black'
): Promise<{ result: Locator; stroke: AiStroke }> {
  const { page } = screen;
  await screen.pickColor(colorName);
  const stroke = await screen.drawStroke();
  await openDrawer(page);
  await aiImageButton(page).click();
  await page
    .getByRole('dialog', { name: 'Pick a style', exact: true })
    .getByRole('button', { name: 'Magical' })
    .click();
  const result = page.getByRole('dialog', { name: 'AI Result', exact: true });
  await expect(result).toBeVisible();
  return { result, stroke };
}

/** A stubbed endpoint, AI turned on, and a generation under way: the dialog and the endpoint. */
export async function openAiResult(
  screen: DrawingScreen,
  colorName = 'Black'
): Promise<{ result: Locator; endpoint: AiEndpoint; stroke: AiStroke }> {
  const endpoint = await stubAiEndpoint(screen.page);
  await enableAi(screen);
  return { endpoint, ...(await startAiGeneration(screen, colorName)) };
}

const GATE_QUESTION = /^What is (\d+) times (\d+)\?$/;

/** Answers the Grown-Ups Only check the way a grown-up would: the product, on its keypad. */
export async function solveParentalGate(page: Page): Promise<void> {
  const gate = page.getByRole('dialog', { name: 'Grown-Ups Only', exact: true });
  await expect(gate).toBeVisible();
  await expectSettled(gate);
  const question = await gate.getByRole('img', { name: GATE_QUESTION }).getAttribute('aria-label');
  const operands = question?.match(GATE_QUESTION);
  if (!operands) throw new Error(`the gate asked something unreadable: ${question}`);
  const answer = String(Number(operands[1]) * Number(operands[2]));
  for (const digit of answer) await gate.getByRole('button', { name: digit, exact: true }).click();
  await gate.getByRole('button', { name: 'Check answer', exact: true }).click();
  await expect(gate).toBeHidden();
}

/** Opens Parent Center in Settings and sets how often one action asks for the grown-up check. */
export async function setGateFrequency(
  page: Page,
  action:
    | 'Generating an AI image'
    | 'Reporting an AI result'
    | 'Viewing external links'
    | 'Sending feedback',
  frequency: 'Every time' | 'Per session' | 'Never'
): Promise<void> {
  const section = await openSettingsSection(page, 'Parent Center');
  const picker = section.getByRole('radiogroup', { name: `${action} parental gate frequency` });
  await picker.getByRole('radio', { name: frequency, exact: true }).click();
  await expect(picker.getByRole('radio', { name: frequency, exact: true })).toBeChecked();
  await section.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(section).toBeHidden();
}

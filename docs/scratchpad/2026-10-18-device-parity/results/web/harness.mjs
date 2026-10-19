// Shared driver for the WEB-1 and AI-1 browser cells: the two arms, the device profiles, an
// external-request guard, the paper-normalized stroke driver, the plan's settle rule and small
// webp captures. Every cell drives both arms through the same public controls and returns plain
// observations; the comparison and the verdict live in the cell scripts and the results records.
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { chromiumExecutablePath } from '../../../../../tools/lib/playwright.mjs';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const SHOTS_DIR = join(HERE, 'shots');

export const ARMS = {
  'rn-web': {
    base: process.env.RN_WEB_URL ?? 'http://127.0.0.1:5300',
    paper: '[data-testid="drawing-paper"]',
  },
  'web-prod': {
    base: process.env.WEB_PROD_URL ?? 'http://127.0.0.1:5400',
    paper: '#drawingCanvas',
  },
};
export const ARM_NAMES = Object.keys(ARMS);

// Agents the shipping specs use for OS detection (web/tests/helpers.ts), plus the two this
// campaign adds: iPhone Safari and an ordinary desktop Chrome (headless Chromium otherwise
// announces itself as HeadlessChrome).
const UA = {
  android:
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36',
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  desktop:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
};

const TOUCH_PHONE = { hasTouch: true, isMobile: true, deviceScaleFactor: 1 };
export const PROFILES = {
  desktop: { viewport: { width: 1280, height: 800 }, userAgent: UA.desktop },
  'desktop-narrow': { viewport: { width: 900, height: 800 }, userAgent: UA.desktop },
  android: { viewport: { width: 412, height: 915 }, userAgent: UA.android, ...TOUCH_PHONE },
  'android-landscape': {
    viewport: { width: 915, height: 412 },
    userAgent: UA.android,
    ...TOUCH_PHONE,
  },
  'android-tablet': {
    viewport: { width: 1024, height: 768 },
    userAgent: UA.android.replace(' Mobile', ''),
    hasTouch: true,
    isMobile: true,
  },
  iphone: { viewport: { width: 390, height: 844 }, userAgent: UA.iphoneSafari, ...TOUCH_PHONE },
  'iphone-landscape': {
    viewport: { width: 844, height: 390 },
    userAgent: UA.iphoneSafari,
    ...TOUCH_PHONE,
  },
  'iphone-chrome': {
    viewport: { width: 390, height: 844 },
    userAgent: UA.iphoneChrome,
    ...TOUCH_PHONE,
  },
  ipad: { viewport: { width: 820, height: 1180 }, userAgent: UA.ipad, ...TOUCH_PHONE },
};

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

export async function launch(extra = {}) {
  return chromium.launch({
    ...extra,
    executablePath: chromiumExecutablePath(chromium),
    // Keep the browser's own background services (sync, GCM, component updates) off the network.
    args: ['--disable-background-networking', '--disable-component-update', '--disable-sync'],
  });
}

// A context whose only network is the two local arms. Anything else is recorded and aborted
// unless a cell installs a labeled fixture for it first (routes registered later win).
export async function openArm(browser, armName, profileName, options = {}) {
  const arm = ARMS[armName];
  const profile = PROFILES[profileName];
  if (!arm || !profile) throw new Error(`Unknown arm or profile: ${armName} / ${profileName}`);
  const ctx = await browser.newContext({
    ...profile,
    ...options.context,
    serviceWorkers: options.serviceWorkers ?? 'allow',
  });
  const external = [];
  await ctx.route('**', (route) => {
    const url = new URL(route.request().url());
    if (LOCAL_HOSTS.has(url.hostname) || url.protocol === 'data:' || url.protocol === 'blob:')
      return route.fallback();
    external.push(`${route.request().method()} ${url.origin}${url.pathname}`);
    return route.abort('blockedbyclient');
  });
  if (options.initScripts)
    for (const script of options.initScripts) await ctx.addInitScript(script);
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 300));
  });
  const cdp = await ctx.newCDPSession(page);
  return {
    arm: armName,
    profile: profileName,
    ...arm,
    base: options.base ?? arm.base,
    ctx,
    page,
    cdp,
    external,
    consoleErrors,
  };
}

// Shipping's own spec shim for an installed launch (web/tests/web-back.spec.ts): headless
// Chromium has no installed display mode to emulate.
export function standaloneShim() {
  const realMatchMedia = window.matchMedia.bind(window);
  window.matchMedia = (query) => {
    const result = realMatchMedia(query);
    if (query === '(display-mode: standalone)')
      Object.defineProperty(result, 'matches', { value: true });
    return result;
  };
}

// Headless Chromium keeps every page visible, so a cell that needs the hidden edge of a
// background/foreground transition flips this shim instead; both arms get the same one.
export function visibilityShim() {
  let hidden = false;
  Object.defineProperty(Document.prototype, 'visibilityState', {
    get: () => (hidden ? 'hidden' : 'visible'),
  });
  Object.defineProperty(Document.prototype, 'hidden', { get: () => hidden });
  window.__setHidden = (next) => {
    hidden = next;
    document.dispatchEvent(new Event('visibilitychange'));
  };
}

export async function boot(session, path = '/') {
  await session.page.goto(session.base + path);
  await session.page.locator(session.paper).waitFor({ state: 'visible', timeout: 20_000 });
  // Both arms boot the drawing first and mount the chrome around it; give lazy chrome one idle.
  await session.page.waitForTimeout(1500);
}

export async function paperBox(session) {
  const box = await session.page.locator(session.paper).boundingBox();
  if (!box) throw new Error(`${session.arm}: the paper has no box`);
  return box;
}

// The plan's stroke paths, in paper-normalized coordinates, kept clear of the corner controls.
export const STROKES = [
  [
    [0.25, 0.35],
    [0.45, 0.42],
    [0.6, 0.38],
  ],
  [
    [0.3, 0.5],
    [0.5, 0.56],
    [0.7, 0.52],
  ],
  [
    [0.28, 0.64],
    [0.48, 0.7],
    [0.66, 0.66],
  ],
];
const SAMPLE_INTERVAL_MS = 8;
const SAMPLES_PER_SEGMENT = 12;

function sampled(points, box) {
  const out = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, ay] = points[i];
    const [bx, by] = points[i + 1];
    for (let s = 0; s < SAMPLES_PER_SEGMENT; s += 1) {
      const t = s / SAMPLES_PER_SEGMENT;
      out.push({
        x: box.x + (ax + (bx - ax) * t) * box.width,
        y: box.y + (ay + (by - ay) * t) * box.height,
      });
    }
  }
  const [lx, ly] = points[points.length - 1];
  out.push({ x: box.x + lx * box.width, y: box.y + ly * box.height });
  return out;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function touch(session, type, point) {
  await session.cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints:
      type === 'touchEnd'
        ? []
        : [{ x: point.x, y: point.y, id: 1, radiusX: 4, radiusY: 4, force: 0.5 }],
  });
}

// One contact through every path in `paths` (a single path is an ordinary stroke). Touch on
// touch profiles, the mouse elsewhere, sampled every 8 ms as the plan's stroke driver requires.
export async function contact(session, paths, { lift = true } = {}) {
  const box = await paperBox(session);
  const points = paths.flatMap((path) => sampled(path, box));
  const useTouch = PROFILES[session.profile].hasTouch === true;
  const [first, ...rest] = points;
  if (useTouch) await touch(session, 'touchStart', first);
  else {
    await session.page.mouse.move(first.x, first.y);
    await session.page.mouse.down();
  }
  for (const point of rest) {
    await sleep(SAMPLE_INTERVAL_MS);
    if (useTouch) await touch(session, 'touchMove', point);
    else await session.page.mouse.move(point.x, point.y);
  }
  if (!lift) return points[points.length - 1];
  if (useTouch) await touch(session, 'touchEnd', points[points.length - 1]);
  else await session.page.mouse.up();
  await sleep(350);
  return points[points.length - 1];
}

export async function drawStrokes(session, count, offset = 0) {
  for (let i = 0; i < count; i += 1) {
    const path = STROKES[(i + offset) % STROKES.length].map(([x, y]) => [
      x,
      Math.min(0.85, y + 0.04 * Math.floor((i + offset) / STROKES.length)),
    ]);
    await contact(session, [path]);
  }
}

export function button(session, name) {
  return session.page.getByRole('button', { name, exact: true });
}

async function enabled(locator) {
  return locator.evaluate(
    (element) => !element.disabled && element.getAttribute('aria-disabled') !== 'true'
  );
}

export async function expandDrawer(session) {
  const expand = button(session, 'Expand controls');
  if (await expand.isVisible().catch(() => false)) {
    await expand.click();
    await button(session, 'Collapse controls').waitFor({ state: 'visible', timeout: 5000 });
    await session.page.waitForTimeout(600);
  }
}

export async function collapseDrawer(session) {
  const collapse = button(session, 'Collapse controls');
  if (await collapse.isVisible().catch(() => false)) {
    await collapse.click();
    await button(session, 'Expand controls').waitFor({ state: 'visible', timeout: 5000 });
    await session.page.waitForTimeout(600);
  }
}

// How many Undo presses the history holds: press while Undo is enabled.
export async function undoDepth(session, limit = 20) {
  await expandDrawer(session);
  const undo = button(session, 'Undo');
  let presses = 0;
  while (presses < limit && (await enabled(undo))) {
    await undo.click();
    presses += 1;
    await session.page.waitForTimeout(300);
  }
  return presses;
}

// The #2921 driver check: three separate strokes must leave three Undo units and the same paths
// in one contact must leave one.
export async function driverCardinality(session) {
  await drawStrokes(session, 3);
  const separate = await undoDepth(session);
  await collapseDrawer(session);
  await contact(session, STROKES);
  const joined = await undoDepth(session);
  await collapseDrawer(session);
  return { separate, joined, admitted: separate === 3 && joined === 1 };
}

const SETTLE_INTERVAL_MS = 250;
const SETTLE_AFTER_INPUT_MS = 1000;
const SETTLE_LIMIT_MS = 10_000;
const SETTLE_RUN = 3;

// The plan's settle rule: three consecutive byte-identical full frames, all at least 1 s after
// the last input, sampled at least every 250 ms; none within 10 s is an `unsettled` failure.
export async function settle(page, lastInputAt = Date.now()) {
  const started = Date.now();
  let previous = null;
  let run = 0;
  let frames = 0;
  while (Date.now() - started < SETTLE_LIMIT_MS) {
    const frame = await page.screenshot();
    frames += 1;
    const digest = createHash('sha256').update(frame).digest('hex');
    if (Date.now() - lastInputAt >= SETTLE_AFTER_INPUT_MS && digest === previous) run += 1;
    else run = Date.now() - lastInputAt >= SETTLE_AFTER_INPUT_MS ? 1 : 0;
    previous = digest;
    if (run >= SETTLE_RUN)
      return { settled: true, frames, ms: Date.now() - started, frame, digest };
    await sleep(SETTLE_INTERVAL_MS);
  }
  return { settled: false, frames, ms: Date.now() - started, frame: null, digest: previous };
}

const SHOT_WIDTH_PX = 360;
const SHOT_QUALITY = 55;

// A settled frame, kept small as webp. Returns the settle record and the committed path.
export async function capture(session, name, lastInputAt) {
  const result = await settle(session.page, lastInputAt);
  const frame = result.frame ?? (await session.page.screenshot());
  mkdirSync(SHOTS_DIR, { recursive: true });
  const file = join(SHOTS_DIR, `${name}.webp`);
  await sharp(frame)
    .resize({ width: SHOT_WIDTH_PX, withoutEnlargement: true })
    .webp({ quality: SHOT_QUALITY })
    .toFile(file);
  return {
    settled: result.settled,
    settleMs: result.ms,
    frames: result.frames,
    shot: `shots/${name}.webp`,
    digest: result.digest,
  };
}

// Whether any pixel in a small paper-normalized square differs from the same square earlier.
export async function regionDigest(session, [nx, ny], sizePx = 6) {
  const box = await paperBox(session);
  const clip = {
    x: box.x + nx * box.width - sizePx / 2,
    y: box.y + ny * box.height - sizePx / 2,
    width: sizePx,
    height: sizePx,
  };
  const bytes = await session.page.screenshot({ clip });
  return createHash('sha256').update(bytes).digest('hex');
}

export function writeJson(file, value) {
  writeFileSync(join(HERE, file), `${JSON.stringify(value, null, 2)}\n`);
}

export function readJson(file) {
  const path = join(HERE, file);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

// Serves a file from a local directory as a fixture response.
export function fileResponse(root, pathname) {
  const file = resolve(root, `.${pathname}`);
  if (!file.startsWith(resolve(root)) || !existsSync(file)) return null;
  const types = {
    '.json': 'application/json',
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
  };
  return {
    status: 200,
    body: readFileSync(file),
    contentType: types[extname(file)] ?? 'application/octet-stream',
  };
}

export async function closeAll(sessions) {
  for (const session of sessions) await session.ctx.close().catch(() => {});
}

// Runs one cell on both arms and keeps a failure as an observation instead of a crash.
export async function onBothArms(browser, profile, run, options = {}) {
  const result = {};
  for (const arm of ARM_NAMES) {
    const session = await openArm(
      browser,
      arm,
      profile,
      typeof options === 'function' ? options(arm) : options
    );
    try {
      result[arm] = await run(session);
    } catch (error) {
      result[arm] = {
        error: String(error?.message ?? error)
          .split('\n')
          .filter((line) => line.trim() && !line.includes('Call log'))
          .slice(0, 2)
          .join(' | ')
          .replaceAll(`${String.fromCharCode(27)}[22m`, '')
          .replaceAll(`${String.fromCharCode(27)}[2m`, ''),
      };
    } finally {
      result[arm] = {
        ...result[arm],
        external: session.external,
        consoleErrors: session.consoleErrors.slice(0, 5),
      };
      await session.ctx.close().catch(() => {});
    }
  }
  return result;
}

// The names of the dialogs on screen, outermost first.
export function openDialogs(session) {
  return session.page.evaluate(() =>
    [...document.querySelectorAll('dialog[open], [role="dialog"], [data-native-modal]')]
      .filter((element) => element.checkVisibility())
      .map(
        (element) =>
          element.getAttribute('aria-label') ||
          element.getAttribute('data-native-modal') ||
          element.querySelector('h1, h2')?.innerText?.trim() ||
          'unnamed'
      )
      .filter((name, index, all) => all.indexOf(name) === index)
  );
}

// The grown-up check in either arm: read the multiplication from its accessible label and tap
// the answer on the keypad, then let the "Unlocked!" hold run out.
export async function solveGate(session) {
  const equation = session.page
    .locator('[aria-label^="What is "]')
    .filter({ visible: true })
    .first();
  const label = await equation.getAttribute('aria-label', { timeout: 5000 });
  const [x, y] = label.match(/\d+/g).map(Number);
  for (const digit of String(x * y)) {
    await session.page
      .getByRole('button', { name: digit, exact: true })
      .filter({ visible: true })
      .first()
      .click();
    await session.page.waitForTimeout(300);
  }
  await session.page
    .getByRole('button', { name: 'Check answer' })
    .filter({ visible: true })
    .first()
    .click();
  await session.page.waitForTimeout(2500);
  return label;
}

export async function openSettings(session) {
  await button(session, 'Settings').click();
  await session.page.getByRole('dialog').first().waitFor({ state: 'visible', timeout: 5000 });
  await session.page.waitForTimeout(1500);
}

// A Settings section: the phone hub's row (named "Title, summary") or the wide shell's nav entry.
export async function openSection(session, title) {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const candidates = [
    session.page.getByRole('button', { name: title, exact: true }),
    session.page.getByRole('button', { name: new RegExp(`^${escaped}\\b`) }),
  ];
  for (const candidate of candidates) {
    const row = candidate.filter({ visible: true }).first();
    if ((await row.count()) === 0) continue;
    await row.click();
    await session.page.waitForTimeout(1500);
    return;
  }
  throw new Error(`No Settings row named ${title}`);
}

export async function where(session) {
  return {
    path: new URL(session.page.url()).pathname,
    dialogs: await openDialogs(session),
    historyLength: await session.page.evaluate(() => history.length),
  };
}

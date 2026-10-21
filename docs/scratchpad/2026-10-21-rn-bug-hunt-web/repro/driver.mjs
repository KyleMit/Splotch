import { chromium, firefox, webkit, expect } from '@playwright/test';
import { appendFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

export { expect };
export const OUT = resolve('docs/scratchpad/2026-10-21-rn-bug-hunt-web');
export const ENGINE = process.env.HUNT_ENGINE ?? 'chromium';
export const BASE = process.env.HUNT_BASE ?? 'http://127.0.0.1:6150';
const DRAWING_IDLE_MS = 450;
export const PROFILES = {
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true },
  tablet: { viewport: { width: 820, height: 1180 }, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 800 }, hasTouch: false },
  narrow: { viewport: { width: 320, height: 740 }, hasTouch: true },
};
export const button = (p, name) => p.getByRole('button', { name, exact: true });
export const engines = { chromium, webkit, firefox };
export async function connect() {
  const browser = await engines[ENGINE].connect(process.env.HUNT_WS ?? 'ws://127.0.0.1:6190/', {
    timeout: 15000,
  });
  const stop = () => {
    void browser.close().finally(() => process.exit(124));
  };
  process.once('SIGTERM', stop);
  browser.once('disconnected', () => process.removeListener('SIGTERM', stop));
  return browser;
}
export async function open(browser, profile, options = {}) {
  const mobileUA =
    ENGINE === 'webkit'
      ? profile === 'tablet'
        ? 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
        : 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
      : ENGINE === 'firefox'
        ? 'Mozilla/5.0 (Android 14; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0'
        : 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36';
  const ctx = await browser.newContext({
    ...PROFILES[profile],
    ...(ENGINE === 'firefox' ? {} : { isMobile: profile !== 'desktop' }),
    ...(profile === 'desktop' ? {} : { userAgent: mobileUA }),
    serviceWorkers: 'block',
    ...options,
  });
  const external = [],
    errors = [];
  await ctx.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === 'blob:' && url.origin === new URL(BASE).origin) return route.continue();
    if (['127.0.0.1', 'localhost'].includes(url.hostname) && !url.pathname.startsWith('/api/'))
      return route.continue();
    external.push(`${route.request().method()} ${url.origin}${url.pathname}`);
    return route.abort('blockedbyclient');
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(7000);
  page.on('pageerror', (e) => errors.push(e.message));
  const cdp = ENGINE === 'chromium' ? await ctx.newCDPSession(page) : null;
  return {
    ctx,
    page,
    cdp,
    profile,
    errors,
    external,
    browserVersion: browser.version(),
    base: BASE,
  };
}
export async function boot(s) {
  await s.page.goto(s.base ?? BASE);
  await s.page
    .locator('html[data-drawing-live][data-controls-live]')
    .waitFor({ state: 'attached' });
  await expect(button(s.page, 'Settings')).toBeVisible();
  await expect(s.page.locator('[data-testid="drawing-paper"]')).toBeVisible();
  await expand(s);
  await expect(button(s.page, 'Brushes')).toBeVisible();
}
export async function expand(s) {
  const e = button(s.page, 'Expand controls');
  if (await e.isVisible()) await e.click();
  await expect(button(s.page, 'Collapse controls')).toBeVisible();
}
export async function closeOverlays(s) {
  await s.page.keyboard.press('Escape');
  await s.page.evaluate(async () => {
    await Promise.allSettled(document.getAnimations().map((a) => a.finished));
  });
  await expect(s.page.getByRole('dialog')).toHaveCount(0);
}
export async function stroke(
  s,
  paths = [
    [
      [0.25, 0.35],
      [0.45, 0.42],
      [0.6, 0.38],
    ],
  ],
  pointer = PROFILES[s.profile].hasTouch ? 'touch' : 'mouse'
) {
  await new Promise((r) => setTimeout(r, DRAWING_IDLE_MS));
  const box = await s.page.locator('[data-testid="drawing-paper"]').boundingBox();
  const points = [];
  for (const path of paths) {
    for (let i = 0; i < path.length - 1; i++) {
      const [a, b] = [path[i], path[i + 1]];
      for (let j = 0; j < 12; j++)
        points.push({
          x: box.x + (a[0] + ((b[0] - a[0]) * j) / 12) * box.width,
          y: box.y + (a[1] + ((b[1] - a[1]) * j) / 12) * box.height,
        });
    }
    const last = path.at(-1);
    points.push({ x: box.x + last[0] * box.width, y: box.y + last[1] * box.height });
  }
  if (pointer === 'touch' && s.cdp) {
    for (let i = 0; i < points.length; i++) {
      await s.cdp.send('Input.dispatchTouchEvent', {
        type: i === 0 ? 'touchStart' : 'touchMove',
        touchPoints: [{ ...points[i], id: 1, radiusX: 4, radiusY: 4, force: 0.5 }],
      });
      await new Promise((r) => setTimeout(r, 8));
    }
    await s.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await s.page.mouse.move(points[0].x, points[0].y);
    await s.page.mouse.down();
    for (const p of points.slice(1)) {
      await s.page.mouse.move(p.x, p.y);
      await new Promise((r) => setTimeout(r, 8));
    }
    await s.page.mouse.up();
  }
  await expect(button(s.page, 'Undo')).toBeEnabled();
  await new Promise((r) => setTimeout(r, DRAWING_IDLE_MS));
}
export async function undoDepth(s, limit = 40) {
  await expect(s.page.getByRole('dialog')).toHaveCount(0);
  await expand(s);
  let n = 0;
  while (n < limit && (await button(s.page, 'Undo').isEnabled())) {
    await button(s.page, 'Undo').click();
    n++;
    await s.page.evaluate(async () => {
      await Promise.allSettled(document.getAnimations().map((a) => a.finished));
    });
    await new Promise((r) => setTimeout(r, DRAWING_IDLE_MS));
  }
  return n;
}
export async function brush(s, name) {
  await closeOverlays(s);
  await button(s.page, 'Brushes').click();
  await expect(button(s.page, name)).toBeVisible();
  await button(s.page, name).click();
  await expect(s.page.getByRole('group', { name: 'Brush Menu' })).toHaveCount(0);
}
export async function paperDigest(s) {
  await button(s.page, 'Purple').hover();
  try {
    await expect(s.page.locator('[data-testid="pointer-halos"]')).toHaveCount(0);
  } catch (error) {
    const halos = await s.page
      .locator('[data-testid="pointer-halos"]')
      .evaluateAll((nodes) => nodes.map((node) => node.outerHTML));
    const file = `${ENGINE}-${s.profile}-held-halo-${Date.now()}.json`;
    writeFileSync(
      `${OUT}/evidence/${file}`,
      JSON.stringify(
        {
          halos,
          limits:
            'Public rendered SVG at the failed quiet-frame precondition; no product state changed.',
        },
        null,
        2
      ) + '\n'
    );
    throw new Error(`${error.message}\nHalo evidence: evidence/${file}`, { cause: error });
  }
  const box = await s.page.locator('[data-testid="drawing-paper"]').boundingBox();
  const start = Date.now();
  let previous = null,
    run = 0,
    bytes;
  while (Date.now() - start < 10000) {
    bytes = await s.page.screenshot({
      clip: {
        x: box.x + box.width * 0.2,
        y: box.y + box.height * 0.25,
        width: box.width * 0.6,
        height: box.height * 0.5,
      },
    });
    const digest = createHash('sha256').update(bytes).digest('hex');
    run = Date.now() - start >= 1000 && digest === previous ? run + 1 : 0;
    previous = digest;
    if (run >= 2) {
      s.lastPaperFrame = bytes;
      return digest;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Paper did not settle to three identical frames');
}
export async function record(s, id, run) {
  if (process.env.HUNT_CASES && !process.env.HUNT_CASES.split(',').includes(id)) return;
  const start = new Date().toISOString();
  let status = 'PASS',
    detail;
  try {
    if (process.env.HUNT_RESET_EACH === '1') await boot(s);
    detail = await run();
  } catch (e) {
    status = 'BLOCKED';
    detail = { error: String(e.message).slice(0, 1800) };
  }
  const name = `${ENGINE}-${s.profile}-${id}-${Date.now()}`;
  const screenshotFile = `${name}.webp`;
  const capture = await settledCapture(s.page).catch((error) => ({
    settled: false,
    error: error.message,
    frame: null,
  }));
  if (capture.frame)
    await sharp(capture.frame).webp({ quality: 80 }).toFile(`${OUT}/evidence/${screenshotFile}`);
  writeFileSync(
    `${OUT}/evidence/${name}.aria.txt`,
    await s.page
      .locator('body')
      .ariaSnapshot()
      .catch(() => '')
  );
  const row = {
    at: start,
    engine: ENGINE,
    profile: s.profile,
    browserVersion: s.browserVersion,
    inputMode:
      ENGINE === 'chromium' && PROFILES[s.profile].hasTouch
        ? 'trusted CDP touch by default'
        : 'trusted mouse by default; configured touch viewport does not establish touch-drag fidelity',
    id,
    status,
    detail,
    evidence: `evidence/${screenshotFile}`,
    capture: {
      settled: capture.settled,
      frames: capture.frames,
      ms: capture.ms,
      error: capture.error,
    },
    errors: s.errors,
    external: s.external,
  };
  appendFileSync(`${OUT}/evidence/observations.jsonl`, JSON.stringify(row) + '\n');
  appendFileSync(
    `${OUT}/results/web-${ENGINE}.md`,
    `\n- ${start} — ${s.profile} ${id}: **${status}**. ${JSON.stringify(detail)} Evidence: [screenshot](../evidence/${screenshotFile}), [tree](../evidence/${name}.aria.txt).\n`
  );
  console.log(JSON.stringify(row));
  return row;
}

async function settledCapture(page) {
  const start = Date.now();
  let previous = '',
    run = 0,
    frame,
    frames = 0;
  while (Date.now() - start < 10000) {
    frame = await page.screenshot();
    frames++;
    const digest = createHash('sha256').update(frame).digest('hex');
    run = Date.now() - start >= 1000 && digest === previous ? run + 1 : 0;
    previous = digest;
    if (run >= 2) return { settled: true, frame, frames, ms: Date.now() - start };
    await new Promise((r) => setTimeout(r, 250));
  }
  return { settled: false, frame, frames, ms: Date.now() - start };
}

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';
import {
  DRAWING_LIVE_ATTRIBUTE,
  CONTROLS_LIVE_ATTRIBUTE,
} from '../../../../experiments/native-architecture/src/platform/firstFrameContract.ts';
import {
  AI_REPLIES,
  installAiFixture,
} from '../../2026-10-18-device-parity/results/web/ai-fixture.mjs';
import {
  contact,
  STROKES,
  expandDrawer,
  solveGate,
} from '../../2026-10-18-device-parity/results/web/harness.mjs';

const OUT = 'docs/scratchpad/2026-10-21-rn-bug-hunt/evidence';
const BASE = process.env.RN_WEB_URL ?? 'http://127.0.0.1:6104';
const ORIGIN = new URL(BASE).origin;
assert.match(ORIGIN, /^http:\/\/127\.0\.0\.1:61\d{2}$/);
const WAIT_MS = 30000;
const CASES = [
  ['server500', AI_REPLIES.serverError],
  ['bare502', AI_REPLIES.bare502],
  ['malformed', AI_REPLIES.malformedJson],
  ['wrongtype', AI_REPLIES.wrongType],
  ['refusal422', AI_REPLIES.refusal],
];
const selectedCase = process.env.RN_HUNT_CASE;
assert.ok(!selectedCase || CASES.some(([name]) => name === selectedCase));
const suffix = selectedCase ? `-${selectedCase}` : '';
const selectedCases = selectedCase ? CASES.filter(([name]) => name === selectedCase) : CASES;
const browser = await chromium.connectOverCDP('http://127.0.0.1:6111');
const ctx = browser.contexts()[0];
const page =
  ctx.pages().find((candidate) => candidate.url().startsWith(ORIGIN)) ?? (await ctx.newPage());
await page.bringToFront();
for (const candidate of ctx.pages()) {
  if (candidate === page || !/^http:\/\/127\.0\.0\.1:61(?:00|02|03)(?:\/|$)/.test(candidate.url()))
    continue;
  await candidate.goto('about:blank');
}
const cdp = await ctx.newCDPSession(page);
const records = [];
const session = {
  ctx,
  page,
  cdp,
  profile: 'android',
  arm: 'rn-web',
  paper: '[data-testid="drawing-paper"]',
};
function adb(...args) {
  return execFileSync('adb', ['-s', 'emulator-5680', ...args], {
    timeout: WAIT_MS,
    maxBuffer: 12 * 1024 * 1024,
  });
}
async function shot(name) {
  await page.waitForTimeout(1000);
  let previous = '',
    stable = 0,
    frame;
  const started = Date.now();
  while (Date.now() - started < 10000) {
    const focus = adb('shell', 'dumpsys', 'window', 'displays')
      .toString()
      .match(/Display: mDisplayId=0\b[\s\S]*?(?=Display: mDisplayId=|$)/)?.[0]
      ?.match(/mCurrentFocus=([^\n]+)/)?.[1];
    assert.ok(focus?.includes('com.android.chrome/'), `Chrome foreground required: ${focus}`);
    frame = adb('exec-out', 'screencap', '-p');
    const digest = createHash('sha256').update(frame).digest('hex');
    stable = digest === previous ? stable + 1 : 1;
    previous = digest;
    if (stable === 3) break;
    await page.waitForTimeout(250);
  }
  const file = `chromium-androidremote-errors${suffix}-${name}.png`;
  writeFileSync(`${OUT}/${file}`, frame);
  return { file, settled: stable === 3, ms: Date.now() - started };
}
async function bootstrap(base, record) {
  await page.goto(base);
  await page
    .locator(`html[${DRAWING_LIVE_ATTRIBUTE}][${CONTROLS_LIVE_ATTRIBUTE}]`)
    .waitFor({ state: 'attached' });
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await expect(async () => {
    if (!(await settings.isVisible()))
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(settings).toBeVisible();
  }).toPass({ timeout: WAIT_MS });
  assert.equal(await page.evaluate(() => navigator.serviceWorker.controller === null), true);
  await settings.getByRole('button', { name: /^AI Art(?:,|$)/ }).click();
  const toggle = page.getByRole('switch', { name: 'Create AI Images', exact: true });
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(settings).toHaveCount(0);
  record.readyShot = await shot(`${record.name}-ready`);
  assert.ok(record.readyShot.settled, 'Root did not settle before drawing');
  await contact(session, [STROKES[0]]);
  await expandDrawer(session);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: /^Create AI image/ }).click();
  if (
    await page
      .locator('[aria-label^="What is "]')
      .isVisible()
      .catch(() => false)
  )
    await solveGate(session);
  await page.getByRole('button', { name: 'Sticker', exact: true }).click();
}
try {
  page.setDefaultTimeout(WAIT_MS);
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  await ctx.addInitScript(() => {
    if (navigator.serviceWorker)
      Object.defineProperty(navigator.serviceWorker, 'register', {
        value: () => Promise.reject(new Error('Fixture disables service workers')),
      });
  });
  for (const [index, [name, reply]] of selectedCases.entries()) {
    const base = new URL(BASE);
    base.port = String(Number(base.port) + index);
    const origin = base.origin;
    assert.match(origin, /^http:\/\/127\.0\.0\.1:61\d{2}$/);
    const record = { name, origin, status: 'running', externalBlocked: [], consoleErrors: [] };
    const onError = (error) => record.consoleErrors.push(String(error).slice(0, 500));
    const onConsole = (message) => {
      if (message.type() === 'error') record.consoleErrors.push(message.text().slice(0, 500));
    };
    page.on('pageerror', onError);
    page.on('console', onConsole);
    records.push(record);
    await page.goto('about:blank');
    await ctx.unrouteAll({ behavior: 'wait' });
    await cdp.send('Storage.clearDataForOrigin', { origin, storageTypes: 'all' });
    await ctx.route('**', (route) => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.fallback();
      record.externalBlocked.push(url.origin + url.pathname);
      return route.abort();
    });
    const log = await installAiFixture(ctx, {
      '/api/generate-image': [reply, AI_REPLIES.picture()],
    });
    const generated = () =>
      log.filter((entry) => entry.path === '/api/generate-image' && entry.method === 'POST');
    try {
      await bootstrap(base.href, record);
      const card = page.getByRole('dialog', { name: 'AI Result', exact: true });
      await expect.poll(() => generated().length, { timeout: WAIT_MS }).toBe(1);
      if (name === 'refusal422') {
        await expect(
          card.getByRole('button', { name: 'Report this refusal', exact: true })
        ).toBeVisible();
        await expect(card.getByRole('button', { name: 'Try again', exact: true })).toHaveCount(0);
        record.errorShot = await shot(`${name}-safe`);
        assert.equal(log.filter((entry) => entry.path === '/api/report-image').length, 0);
      } else {
        await expect(
          card.getByRole('heading', { name: "Hmm, that didn't work", exact: true })
        ).toBeVisible();
        record.errorShot = await shot(`${name}-error`);
        await page.waitForTimeout(2000);
        assert.equal(generated().length, 1, 'Unrequested second generation');
        await card.getByRole('button', { name: 'Try again', exact: true }).click();
        await expect(card.getByRole('button', { name: 'Download', exact: true })).toBeVisible({
          timeout: WAIT_MS,
        });
        await expect(card.getByRole('img', { name: 'Your AI picture', exact: true })).toBeVisible();
        assert.equal(generated().length, 2, 'Retry did not upload exactly once');
        assert.equal(generated()[0].upload.bytes, generated()[1].upload.bytes);
        record.retryShot = await shot(`${name}-retry-success`);
      }
      record.status = 'pass';
    } catch (error) {
      record.status = 'blocked';
      record.error = String(error);
      record.blockedShot = await shot(`${name}-blocked`).catch(() => null);
    } finally {
      page.off('pageerror', onError);
      page.off('console', onConsole);
      record.fixtureRequests = log;
      writeFileSync(
        `${OUT}/chromium-androidremote-error${suffix}-results.json`,
        JSON.stringify(records, null, 2) + '\n'
      );
      console.log(name, record.status, record.error ?? '');
    }
  }
} finally {
  await page.goto('about:blank').catch(() => {});
  for (const record of records)
    await cdp
      .send('Storage.clearDataForOrigin', { origin: record.origin, storageTypes: 'all' })
      .catch(() => {});
  await browser.close();
  if (records.some((record) => record.status !== 'pass')) process.exitCode = 1;
}

import { chromium, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import {
  installAiFixture,
  AI_REPLIES,
} from '../../2026-10-18-device-parity/results/web/ai-fixture.mjs';
import {
  contact,
  STROKES,
  expandDrawer,
  solveGate,
  settle,
} from '../../2026-10-18-device-parity/results/web/harness.mjs';
const folder = 'docs/scratchpad/2026-10-21-rn-bug-hunt/evidence';
const browser = await chromium.connectOverCDP('http://127.0.0.1:6111');
const base = process.env.RN_WEB_URL ?? 'http://127.0.0.1:6102';
const records = [],
  external = [];
let requests = [],
  session;
async function shot(name) {
  const result = await settle(session.page);
  const path = `${folder}/chromium-androidremote-ai-${name}.png`;
  writeFileSync(path, result.frame ?? (await session.page.screenshot()));
  return { path, settled: result.settled };
}
async function gate() {
  if (
    await session.page
      .locator('[aria-label^="What is "]')
      .isVisible()
      .catch(() => false)
  )
    await solveGate(session);
}
try {
  const ctx = browser.contexts()[0],
    page = ctx.pages()[0] ?? (await ctx.newPage());
  page.setDefaultTimeout(30000);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  await page.goto('about:blank');

  await ctx.addInitScript(() => {
    if (navigator.serviceWorker && !Object.hasOwn(navigator.serviceWorker, 'register'))
      Object.defineProperty(navigator.serviceWorker, 'register', {
        value: () => Promise.reject(new Error('AI fixture disables service workers')),
      });
  });
  await ctx.route('**', (r) => {
    const u = new URL(r.request().url());
    if (['127.0.0.1', 'localhost'].includes(u.hostname)) return r.fallback();
    external.push(u.origin + u.pathname);
    return r.abort();
  });
  requests = await installAiFixture(ctx, {
    '/api/generate-image': [AI_REPLIES.picture('portrait')],
  });
  session = {
    ctx,
    page,
    cdp,
    profile: 'android',
    arm: 'rn-web',
    paper: '[data-testid="drawing-paper"]',
  };
  await page.goto('about:blank');
  await page.goto(base);
  await page.getByRole('button', { name: 'Settings', exact: true }).waitFor();
  expect(await page.evaluate(() => navigator.serviceWorker.controller === null)).toBe(true);
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await expect(async () => {
    if (!(await settings.isVisible()))
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(settings).toBeVisible();
  }).toPass({ timeout: 30000 });
  await settings.getByRole('button', { name: /^AI Art(?:,|$)/ }).click();
  const enabled = page.getByRole('switch', { name: 'Create AI Images', exact: true });
  if ((await enabled.getAttribute('aria-checked')) !== 'true') await enabled.click();
  await expect(enabled).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(settings).toHaveCount(0);
  await contact(session, [STROKES[0]]);
  await expandDrawer(session);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: /^Create AI image/ }).click();
  await gate();
  await expect(page.getByRole('button', { name: 'Sticker', exact: true })).toBeVisible();
  records.push({ id: 'A01-prompt', status: 'pass', shot: await shot('prompt') });
  await page.getByRole('button', { name: 'Sticker', exact: true }).click();
  const card = page.getByRole('dialog', { name: 'AI Result', exact: true });
  await expect(card).toBeVisible();
  await expect
    .poll(
      () =>
        card
          .locator('img')
          .evaluateAll((images) => images.some((i) => i.complete && i.naturalWidth > 64)),
      { timeout: 30000 }
    )
    .toBe(true);
  await expect
    .poll(
      () => requests.filter((r) => r.path === '/api/generate-image' && r.method === 'POST').length,
      { timeout: 30000 }
    )
    .toBe(1);
  await expect(card.getByRole('button', { name: 'Download', exact: true })).toBeVisible({
    timeout: 30000,
  });
  records.push({ id: 'A02-result', status: 'pass', shot: await shot('result') });
  await page.getByRole('button', { name: 'Report this picture', exact: true }).click();
  await gate();
  const confirm = page.getByRole('dialog', { name: 'Report this picture', exact: true });
  await expect(confirm).toBeVisible();
  expect(
    requests.filter((r) => r.path === '/api/report-image' && r.method === 'POST')
  ).toHaveLength(0);
  await confirm.getByRole('button', { name: 'Send report', exact: true }).click();
  await expect
    .poll(
      () => requests.filter((r) => r.path === '/api/report-image' && r.method === 'POST').length
    )
    .toBe(1);
  await expect(page.getByText(/^Thanks\. We'll review/)).toBeVisible();
  records.push({ id: 'A03-confirmed-report-fixture', status: 'pass', shot: await shot('report') });
} catch (error) {
  records.push({
    id: 'current-ai-step',
    status: 'blocked',
    error: String(error),
    shot: await shot('blocked').catch(() => null),
  });
} finally {
  writeFileSync(
    `${folder}/chromium-androidremote-ai-results.json`,
    JSON.stringify(
      {
        source: 'b236d639160459eecd60900926c759af5d4ae080',
        records,
        fixtureRequests: requests,
        externalBlocked: external,
      },
      null,
      2
    ) + '\n'
  );
  console.log(records.map((r) => ({ id: r.id, status: r.status, error: r.error })));
  await browser.close();
}

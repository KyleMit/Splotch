import { chromium, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import {
  boot,
  openArm,
  driverCardinality,
  contact,
  STROKES,
  expandDrawer,
  openSettings,
  settle,
} from '../../2026-10-18-device-parity/results/web/harness.mjs';
import { installAiFixture } from '../../2026-10-18-device-parity/results/web/ai-fixture.mjs';
const engine = process.env.RN_HUNT_ENGINE ?? 'chromium';
if (engine !== 'chromium')
  throw new Error(
    'This trusted-touch runner is Chromium-only; check-capabilities.mjs admits every engine.'
  );
const profile = process.env.RN_HUNT_PROFILE ?? 'iphone';
const prefix = `${engine}-${profile}${process.env.RN_HUNT_CDP ? 'remote' : ''}`;
const folder = 'docs/scratchpad/2026-10-21-rn-bug-hunt/evidence';
const records = [];
const browser = process.env.RN_HUNT_CDP
  ? await chromium.connectOverCDP(process.env.RN_HUNT_CDP)
  : await chromium.launch({ headless: true });
let session;
async function shot(name) {
  const result = await settle(session.page);
  const path = `${folder}/${prefix}-${name}.png`;
  writeFileSync(path, result.frame ?? (await session.page.screenshot()));
  return { path, settled: result.settled, ms: result.ms };
}
async function run(id, fn) {
  try {
    const detail = await fn();
    records.push({ id, status: 'pass', ...detail });
  } catch (e) {
    records.push({
      id,
      status: 'blocked',
      error: String(e),
      shot: await shot(`${id}-blocked`).catch(() => null),
    });
  }
  writeFileSync(
    `${folder}/${prefix}-results.json`,
    JSON.stringify(
      { engine, profile, source: 'b236d639160459eecd60900926c759af5d4ae080', records },
      null,
      2
    ) + '\n'
  );
  console.log(id, records.at(-1).status);
}
try {
  if (process.env.RN_HUNT_CDP) {
    const ctx = browser.contexts()[0];
    const page =
      ctx.pages().find((p) => p.url().startsWith('http://127.0.0.1:6100')) ?? (await ctx.newPage());
    const external = [],
      consoleErrors = [];
    await ctx.route('**', (route) => {
      const url = new URL(route.request().url());
      if (['127.0.0.1', 'localhost'].includes(url.hostname)) return route.fallback();
      external.push(url.origin + url.pathname);
      return route.abort();
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    const cdp = await ctx.newCDPSession(page);
    const base = process.env.RN_WEB_URL ?? 'http://127.0.0.1:6100';
    await cdp.send('Storage.clearDataForOrigin', { origin: base, storageTypes: 'all' });
    session = {
      ctx,
      page,
      cdp,
      external,
      consoleErrors,
      base,
      profile: 'android',
      arm: 'rn-web',
      paper: '[data-testid="drawing-paper"]',
    };
  } else {
    session = await openArm(browser, 'rn-web', profile, {
      base: process.env.RN_WEB_URL ?? 'http://127.0.0.1:6100',
      serviceWorkers: 'block',
    });
  }
  session.page.setDefaultTimeout(30000);
  const requests = await installAiFixture(session.ctx);
  await boot(session);
  await run('boot', async () => ({
    shot: await shot('boot'),
    browserVersion: browser.version(),
    actualViewport: await session.page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      touch: navigator.maxTouchPoints,
    })),
  }));
  await run('D01', async () => {
    const result = await driverCardinality(session);
    writeFileSync(`${folder}/${prefix}-cardinality.json`, JSON.stringify(result, null, 2) + '\n');
    expect(result).toEqual({ separate: 3, joined: 1, admitted: true });
    return { ...result, shot: await shot('admission') };
  });
  await run('D02-stroke', async () => {
    await contact(session, [STROKES[0]]);
    await expandDrawer(session);
    await expect(session.page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
    return { shot: await shot('stroke') };
  });
  await run('S01-core-sections', async () => {
    await openSettings(session);
    const shots = [];
    for (const title of [
      'Appearance',
      'Sound',
      'Tool Drawer',
      'Accessibility',
      'Coloring',
      'AI Art',
      'Saving',
    ]) {
      const row = session.page
        .getByRole('dialog')
        .last()
        .getByRole('button', { name: new RegExp('^' + title + '(?:,|$)') })
        .first();
      await row.click();
      shots.push(await shot(`section-${title.replaceAll(' ', '-')}`));
      const back = session.page.getByRole('button', { name: 'Back', exact: true });
      if (await back.isVisible()) await back.click();
    }
    await session.page.keyboard.press('Escape');
    return { shots };
  });
  await run('L01-reload', async () => {
    await session.page.reload();
    await session.page.getByRole('button', { name: 'Settings', exact: true }).waitFor();
    await expandDrawer(session);
    await expect(session.page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    return { shot: await shot('blank-reload') };
  });
  writeFileSync(
    `${folder}/${prefix}-network.json`,
    JSON.stringify(
      {
        externalBlocked: session.external,
        fixtureRequests: requests,
        consoleErrors: session.consoleErrors,
      },
      null,
      2
    ) + '\n'
  );
} finally {
  await session?.ctx.close().catch(() => {});
  await browser.close();
}

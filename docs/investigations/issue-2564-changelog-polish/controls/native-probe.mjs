import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import { spawnViteServer } from '../../../../tools/lib/vite-server.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../../../', import.meta.url)).replace(/\/$/, '');
const manifest = JSON.parse(
  await readFile(`${root}/web/.svelte-kit/output/client/.vite/manifest.json`)
);
const gateFile = manifest['src/lib/components/ParentalGate.svelte'].file;
const server = spawnViteServer(5300, {
  command: 'preview',
  env: { CAPACITOR: 'true' },
  stdout: 'ignore',
  stderr: 'ignore',
});
const browser = await chromium.launch();
const records = [];
expect.configure({ timeout: 10000 });
async function context(theme = 'light') {
  const ctx = await browser.newContext({
    viewport: { width: 320, height: 568 },
    colorScheme: theme,
  });
  await ctx.addInitScript(() => {
    window.requestIdleCallback = () => 1;
    window.cancelIdleCallback = () => {};
  });
  await ctx.route('https://splotch.art/feedback', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Native outbound evidence fixture</h1>' })
  );
  return ctx;
}
async function ready(page, route) {
  await page.goto(`http://localhost:5300/${route}`);
  await expect(page.locator('.lede-toggle')).toBeAttached();
}
async function solve(page) {
  const gate = page.locator('#parentalGate');
  const label = await gate.locator('.gate-equation').getAttribute('aria-label');
  const [x, y] = label.match(/\d+/g).map(Number);
  for (const [i, digit] of [...String(x * y)].entries()) {
    await expect(async () => {
      if ((await gate.locator('.gate-dab.filled').count()) <= i)
        await gate.getByRole('button', { name: digit, exact: true }).click();
      await expect(gate.locator('.gate-dab.filled')).toHaveCount(i + 1, { timeout: 1000 });
    }).toPass({ timeout: 15000 });
  }
  await expect(async () => {
    await gate.getByRole('button', { name: 'Check answer' }).click();
    await expect(gate.locator('.gate-keypad')).not.toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15000 });
}
try {
  await expect(async () =>
    expect((await fetch('http://localhost:5300/privacy')).ok).toBe(true)
  ).toPass({ timeout: 10000 });
  for (const theme of ['light', 'dark']) {
    const ctx = await context(theme),
      page = await ctx.newPage();
    await ready(page, 'changelog#release-1-0-0');
    await expect(page.locator('.release-older')).toHaveAttribute('open');
    await expect(page.locator('#release-1-0-0')).toHaveAttribute('data-arrived');
    await expect
      .poll(() =>
        page
          .locator('#release-1-0-0')
          .evaluate((article) => Math.round(article.getBoundingClientRect().top))
      )
      .toBeGreaterThanOrEqual(0);
    expect(
      await page
        .locator('#release-1-0-0')
        .evaluate((article) => article.getBoundingClientRect().top)
    ).toBeLessThan(120);
    await ready(page, 'changelog');
    const contents = page.locator('.contents-disclosure');
    await contents.locator('summary').click();
    await contents.locator('.panel[data-armed]').waitFor();
    await contents.getByRole('link', { name: 'Version 1.2.0' }).click();
    await expect(page.locator('#release-1-2-0')).toHaveAttribute('data-arrived');
    const gap = await page.evaluate(
      () =>
        document.querySelector('#release-1-2-0').getBoundingClientRect().top -
        document.querySelector('.contents-disclosure').getBoundingClientRect().bottom
    );
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThan(48);
    records.push({
      route: 'changelog',
      theme,
      initialFoldedFragmentLanded: true,
      narrowFoldedPickGap: gap,
      arrival: true,
    });
    await ctx.close();
  }
  for (const [route, theme] of ['privacy', 'changelog'].flatMap((route) =>
    ['light', 'dark'].map((theme) => [route, theme])
  )) {
    console.log('cold', route, theme);
    const ctx = await context(theme),
      page = await ctx.newPage();
    let gateRequests = 0;
    page.on('request', (req) => {
      if (req.url().endsWith(gateFile)) gateRequests++;
    });
    await ready(page, route);
    expect(gateRequests).toBe(0);
    const link = page.locator('.page-footer').getByRole('link', { name: /Send feedback/ });
    await link.click();
    await expect(page.locator('#parentalGate')).toBeVisible();
    await expect(page.locator('#parentalGate')).toHaveCount(1);
    expect(ctx.pages().length).toBe(1);
    await page.screenshot({
      path: `${root}/screenshots/issue-2564/native-${route}-${theme}-cold-gate.png`,
    });
    const popup = page.waitForEvent('popup');
    await solve(page);
    const destination = await popup;
    await expect(destination).toHaveURL('https://splotch.art/feedback');
    records.push({
      route,
      theme,
      coldGateRequestsBeforeClick: 0,
      gateRequests,
      externalBeforeSolve: false,
      replayTarget: destination.url(),
      oneDialog: true,
    });
    await ctx.close();
  }
  console.log('manage');
  const ctx = await context(),
    page = await ctx.newPage();
  await ready(page, 'privacy');
  const bodyLink = page.getByRole('link', { name: 'OpenAI Services Agreement' });
  await bodyLink.click();
  await expect(page.locator('#parentalGate')).toBeVisible();
  expect(ctx.pages().length).toBe(1);
  await expect(async () => {
    await page
      .locator('#parentalGate')
      .getByRole('button', { name: /Manage these checks in/ })
      .click();
    await expect(page.getByText('Solve the problem to manage grown-up checks')).toBeVisible();
  }).toPass({ timeout: 10000 });
  await solve(page);
  await expect(page.locator('#settingsModal')).toBeVisible();
  await expect(page.locator('#settingsModal')).toHaveCount(1);
  await page.screenshot({ path: `${root}/screenshots/issue-2564/native-privacy-manage.png` });
  await page.locator('#settingsModal').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('#settingsModal')).not.toBeVisible();
  await expect(bodyLink).toBeFocused();
  records.push({
    route: 'privacy',
    existingBodyLinkGated: true,
    manageSingleHost: true,
    closeReturnsFocus: true,
  });
  await ctx.close();
  for (const mode of ['never', 'session']) {
    const ctx = await context(),
      page = await ctx.newPage();
    await ctx.addInitScript(
      (mode) => localStorage.setItem('splotch-parental-gate-external-links-mode', mode),
      mode
    );
    await ready(page, 'changelog');
    const link = page.locator('.page-footer').getByRole('link', { name: /Send feedback/ });
    if (mode === 'session') {
      await link.click();
      await expect(page.locator('#parentalGate')).toBeVisible();
      const first = page.waitForEvent('popup');
      await solve(page);
      await (await first).close();
    }
    const popup = page.waitForEvent('popup');
    await link.click();
    const destination = await popup;
    await expect(destination).toHaveURL('https://splotch.art/feedback');
    records.push({
      mode,
      immediateOriginalClickPopup: true,
      gateVisible: await page.locator('#parentalGate').isVisible(),
    });
    await ctx.close();
  }
  console.log(JSON.stringify(records, null, 2));
} finally {
  await writeFile(
    `${root}/screenshots/issue-2564/native-records.json`,
    JSON.stringify(records, null, 2)
  );
  await browser.close();
  server.stop();
}

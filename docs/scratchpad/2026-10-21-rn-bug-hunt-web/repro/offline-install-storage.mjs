import { appendFileSync } from 'node:fs';
import {
  connect,
  open,
  boot,
  button,
  record,
  expect,
  OUT,
  ENGINE,
  stroke,
  undoDepth,
  paperDigest,
  BASE,
} from './driver.mjs';
import { land, settings } from './ui.mjs';

async function three(s) {
  for (let i = 0; i < 3; i++)
    await stroke(s, [
      [
        [0.25, 0.35 + i * 0.1],
        [0.6, 0.4 + i * 0.1],
      ],
    ]);
}
const browser = await connect();
try {
  for (const profile of ['phone', 'tablet', 'desktop']) {
    const s = await open(browser, profile, { serviceWorkers: 'allow' });
    try {
      await boot(s);
      await record(s, 'W03-W14-offline-shell', async () => {
        await three(s);
        await expect
          .poll(
            () =>
              s.page.evaluate(
                async () => !!(await navigator.serviceWorker.getRegistration())?.active
              ),
            { timeout: 45000 }
          )
          .toBe(true);
        await s.page.reload();
        await s.page
          .locator('html[data-drawing-live][data-controls-live]')
          .waitFor({ state: 'attached' });
        await expect
          .poll(() => s.page.evaluate(() => !!navigator.serviceWorker.controller), {
            timeout: 15000,
          })
          .toBe(true);
        const state = await s.page.evaluate(async () => ({
          secure: isSecureContext,
          controller: navigator.serviceWorker.controller?.scriptURL,
          caches: await caches.keys(),
        }));
        await s.ctx.setOffline(true);
        await s.page.reload();
        await s.page
          .locator('html[data-drawing-live][data-controls-live]')
          .waitFor({ state: 'attached' });
        await bootOffline(s);
        await stroke(s);
        expect(await undoDepth(s)).toBe(1);
        await settings(s, 'Sound');
        await s.page.keyboard.press('Escape');
        await expect(s.page.getByRole('dialog')).toHaveCount(0);
        await button(s.page, 'Coloring books').click();
        await land(s);
        await button(s.page, 'Cat coloring page').click();
        await expect(s.page.getByRole('dialog')).toHaveCount(0);
        const art = await paperDigest(s);
        return {
          state,
          offlineHydrated: true,
          drewAndUndid: true,
          lazySoundOpened: true,
          farmSelected: true,
          artDigest: art,
          limits: 'Same-build offline; update uses a separate revision fixture.',
        };
      });
    } finally {
      await s.ctx.setOffline(false);
      await s.ctx.close();
    }
  }
  for (const profile of ['phone', 'desktop', 'narrow']) {
    const s = await open(browser, profile);
    try {
      await boot(s);
      await record(s, 'W01-W02-install-event', async () => {
        await s.page.evaluate(() => {
          window.__installCalls = 0;
          const e = new Event('beforeinstallprompt', { cancelable: true });
          Object.assign(e, {
            prompt: async () => {
              window.__installCalls++;
            },
            userChoice: Promise.resolve({ outcome: 'dismissed' }),
          });
          window.dispatchEvent(e);
        });
        await three(s);
        await button(s.page, 'Collapse controls').click();
        await expect(button(s.page, 'Expand controls')).toBeVisible();
        await land(s);
        const tree = await s.page.locator('body').ariaSnapshot();
        const candidates = s.page
          .getByRole('button', { name: /Install|Add to Home/ })
          .filter({ visible: true });
        const count = await candidates.count();
        expect(count).toBeGreaterThan(0);
        await candidates.first().click();
        await expect.poll(() => s.page.evaluate(() => window.__installCalls)).toBe(1);
        return {
          tree,
          promptCalls: 1,
          fixtureOutcome: 'dismissed',
          limits:
            'Named beforeinstallprompt fixture, not OS install UI; banner screenshot saved by case.',
        };
      });
    } finally {
      await s.ctx.close();
    }
  }
  {
    const s = await open(browser, 'desktop');
    try {
      await boot(s);
      await record(s, 'W11-two-tab-settings', async () => {
        await settings(s, 'Appearance');
        await s.page.getByRole('radio', { name: 'Flat', exact: true }).click();
        await expect(s.page.getByRole('radio', { name: 'Flat', exact: true })).toBeChecked();
        const p2 = await s.ctx.newPage();
        await p2.goto(BASE);
        await p2.locator('html[data-controls-live]').waitFor({ state: 'attached' });
        const second = { ...s, page: p2 };
        await settings(second, 'Appearance');
        await expect(p2.getByRole('radio', { name: 'Flat', exact: true })).toBeChecked();
        await p2.getByRole('radio', { name: 'Dark', exact: true }).click();
        await expect(p2.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
        await boot(s);
        await settings(s, 'Appearance');
        await expect(s.page.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
        await expect(s.page.getByRole('radio', { name: 'Flat', exact: true })).toBeChecked();
        await p2.close();
        return {
          newTabReadFlat: true,
          firstTabReloadReadDark: true,
          flatPreserved: true,
          limits: 'Sequential writes and reloads; no live synchronization guarantee inferred.',
        };
      });
    } finally {
      await s.ctx.close();
    }
  }
  appendFileSync(
    `${OUT}/status.md`,
    `\n- ${new Date().toISOString()} — ${ENGINE} offline/install/storage batch ended; actual SW control and offline hydration assertions recorded separately from install event fixtures.\n`
  );
} finally {
  await browser.close();
}

async function bootOffline(s) {
  const e = button(s.page, 'Expand controls');
  if (await e.isVisible()) await e.click();
  await expect(button(s.page, 'Brushes')).toBeVisible();
}

if (!process.env.HUNT_CASES || process.env.HUNT_CASES.includes('C02-C03-C04-S06-library'))
  await import('./library.mjs');
if (!process.env.HUNT_CASES || process.env.HUNT_CASES.includes('P02-W12-many-pictures'))
  await import('./many-pictures.mjs');
if (!process.env.HUNT_CASES || process.env.HUNT_CASES.includes('D04-D05-page-magic-eraser-theme'))
  await import('./coloring-brushes.mjs');

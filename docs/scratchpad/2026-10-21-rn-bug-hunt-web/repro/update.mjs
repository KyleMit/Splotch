import { appendFileSync, writeFileSync } from 'node:fs';
import { startArmProxy } from '../../2026-10-18-device-parity/results/web/arm-proxy.mjs';
import { visibilityShim } from '../../2026-10-18-device-parity/results/web/harness.mjs';
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
} from './driver.mjs';
import { land } from './ui.mjs';

const proxy = await startArmProxy('http://127.0.0.1:6150', 6152);
let browser;
let proxyStopped = false;
try {
  browser = await connect();
  const s = await open(browser, 'desktop', { serviceWorkers: 'allow' });
  s.base = proxy.base;
  await s.ctx.addInitScript(visibilityShim);
  try {
    await boot(s);
    await record(s, 'W04-W14-update-revision-fixture', async () => {
      for (let i = 0; i < 3; i++)
        await stroke(s, [
          [
            [0.25, 0.35 + i * 0.1],
            [0.6, 0.4 + i * 0.1],
          ],
        ]);
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
        .locator('html[data-controls-live][data-drawing-live]')
        .waitFor({ state: 'attached' });
      await expect
        .poll(() => s.page.evaluate(() => !!navigator.serviceWorker.controller))
        .toBe(true);
      if (await button(s.page, 'Expand controls').isVisible())
        await button(s.page, 'Expand controls').click();
      await stroke(s);
      const original = await proxy.fetchUpstream('/sw.js');
      proxy.override(
        '/sw.js',
        Buffer.concat([original.body, Buffer.from('\n// RN bug hunt revision fixture\n')]),
        'text/javascript'
      );
      proxy.override(
        '/version.json',
        JSON.stringify({ version: '9.9.9-bughunt-fixture' }),
        'application/json'
      );
      const navigations = [];
      s.page.on('framenavigated', (f) => {
        if (f === s.page.mainFrame()) navigations.push(f.url());
      });
      await s.page.evaluate(async () => {
        await (await navigator.serviceWorker.getRegistration()).update();
      });
      await expect
        .poll(
          () =>
            s.page.evaluate(
              async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state
            ),
          { timeout: 30000 }
        )
        .toBe('installed');
      await s.page.evaluate(() => window.__setHidden(true));
      await new Promise((r) => setTimeout(r, 2000));
      expect(navigations).toHaveLength(0);
      await s.page.evaluate(() => window.__setHidden(false));
      expect(await undoDepth(s)).toBe(1);
      await land(s);
      await s.page.evaluate(() => window.__setHidden(true));
      await expect.poll(() => navigations.length, { timeout: 20000 }).toBeGreaterThan(0);
      await s.page
        .locator('html[data-controls-live][data-drawing-live]')
        .waitFor({ state: 'attached' });
      await proxy.close();
      proxyStopped = true;
      await s.page.reload();
      await s.page
        .locator('html[data-controls-live][data-drawing-live]')
        .waitFor({ state: 'attached' });
      if (await button(s.page, 'Expand controls').isVisible())
        await button(s.page, 'Expand controls').click();
      await stroke(s);
      expect(await undoDepth(s)).toBe(1);
      return {
        waitingBeforeHide: 'installed',
        inkPreventedReload: true,
        blankHiddenReloaded: true,
        navigations,
        offlineAfterUpdateDrew: true,
        offlineFixture: 'Stop this case’s local proxy after the new worker takes control.',
        limits:
          'Changed-worker and version fixture uses the same qualified app artifact, not a second release. Hidden state is a named headless fixture.',
      };
    });
  } finally {
    await s.ctx.setOffline(false);
    await s.ctx.close();
  }
  writeFileSync(
    `${OUT}/evidence/${ENGINE}-update-proxy.json`,
    JSON.stringify(proxy.log, null, 2) + '\n'
  );
  appendFileSync(
    `${OUT}/status.md`,
    `\n- ${new Date().toISOString()} — ${ENGINE} PWA changed-revision fixture ended; proxy 6152 closed. No second release artifact claimed.\n`
  );
} finally {
  await browser?.close();
  if (!proxyStopped) await proxy.close();
}

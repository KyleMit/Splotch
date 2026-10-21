import { appendFileSync } from 'node:fs';
import { startArmProxy } from '../../2026-10-18-device-parity/results/web/arm-proxy.mjs';
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
} from './driver.mjs';
import { settings, land } from './ui.mjs';

const browser = await connect();
try {
  for (const profile of ['phone', 'tablet', 'desktop']) {
    const proxy = await startArmProxy('http://127.0.0.1:6150', 6153);
    let stopped = false;
    const s = await open(browser, profile, { serviceWorkers: 'allow' });
    s.base = proxy.base;
    try {
      await boot(s);
      await record(s, 'W03-W14-offline-host-loss', async () => {
        for (let index = 0; index < 3; index++) await stroke(s);
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
        const before = await s.page.evaluate(async () => ({
          secure: isSecureContext,
          controller: navigator.serviceWorker.controller.scriptURL,
          caches: await caches.keys(),
        }));
        await proxy.close();
        stopped = true;
        await s.page.reload();
        await s.page
          .locator('html[data-controls-live][data-drawing-live]')
          .waitFor({ state: 'attached' });
        if (await button(s.page, 'Expand controls').isVisible())
          await button(s.page, 'Expand controls').click();
        await stroke(s);
        expect(await undoDepth(s)).toBe(1);
        await settings(s, 'Sound');
        await s.page.keyboard.press('Escape');
        await expect(s.page.getByRole('dialog')).toHaveCount(0);
        await button(s.page, 'Coloring books').click();
        await land(s);
        await button(s.page, 'Cat coloring page').click();
        await expect(s.page.getByRole('dialog')).toHaveCount(0);
        await paperDigest(s);
        return {
          before,
          serverStopped: true,
          reloadWorked: true,
          drawAndUndoWorked: true,
          lazySoundOpened: true,
          cachedFarmSelected: true,
          limits:
            'Simulate a lost connection by stopping this case’s own local server. navigator.onLine is unchanged; OS airplane mode is not claimed.',
        };
      });
    } finally {
      await s.ctx.close();
      if (!stopped) await proxy.close();
    }
  }
  appendFileSync(
    `${OUT}/status.md`,
    `\n- ${new Date().toISOString()} — ${ENGINE} offline host-loss checks ended; each case stopped only its owned proxy 6153.\n`
  );
} finally {
  await browser.close();
}

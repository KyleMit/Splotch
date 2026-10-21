import { writeFileSync } from 'node:fs';
import { connect, open, boot, button, expect, OUT, stroke, ENGINE } from './driver.mjs';
import { settings, land } from './ui.mjs';
import {
  installAiFixture,
  AI_REPLIES,
} from '../../2026-10-18-device-parity/results/web/ai-fixture.mjs';

const prefix = ENGINE === 'chromium' ? '' : `${ENGINE}-`;
const browser = await connect();
const results = [];
try {
  for (let repeat = 1; repeat <= 2; repeat++) {
    const s = await open(browser, 'phone');
    await s.ctx.addInitScript(() => {
      window.__failAiWrite = false;
      window.__failedAiWrites = 0;
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        if (window.__failAiWrite && this.transaction.db.name === 'splotch-beta-ai-jobs-v1') {
          window.__failedAiWrites++;
          throw new DOMException('Quota fixture: preparation write refused', 'QuotaExceededError');
        }
        return put.apply(this, args);
      };
    });
    const log = await installAiFixture(s.ctx, { '/api/generate-image': [AI_REPLIES.picture()] });
    const launch = async () => {
      await s.page.getByRole('button', { name: /Create AI image/ }).click();
      await expect(button(s.page, 'Sticker')).toBeVisible();
      await land(s);
      await button(s.page, 'Sticker').click();
    };
    try {
      await boot(s);
      await settings(s, 'AI Art');
      for (const [name, value] of [
        ['Create AI Images', true],
        ['Customize AI Style', true],
        ['Auto-Save AI Images', false],
      ]) {
        const t = s.page.getByRole('switch', { name, exact: true });
        if ((await t.isChecked()) !== value) await t.click();
        await expect(t).toBeChecked({ checked: value });
      }
      await s.page.keyboard.press('Escape');
      await expect(s.page.getByRole('dialog')).toHaveCount(0);
      await stroke(s);
      await s.page.evaluate(() => (window.__failAiWrite = true));
      await launch();
      await expect(button(s.page, 'Try again')).toBeVisible();
      await land(s);
      const failedWrites = await s.page.evaluate(() => window.__failedAiWrites);
      expect(failedWrites).toBeGreaterThan(0);
      await s.page.screenshot({
        path: `${OUT}/evidence/${prefix}quota-${repeat}-first-failure.png`,
      });
      await s.page.evaluate(() => (window.__failAiWrite = false));
      await button(s.page, 'Try again').click();
      await expect(
        s.page.getByRole('heading', { name: 'Still not working', exact: true })
      ).toBeVisible();
      await land(s);
      expect(log.filter((r) => r.path === '/api/generate-image').length).toBe(0);
      expect(await s.page.evaluate(() => window.__failedAiWrites)).toBe(failedWrites);
      await s.page.screenshot({ path: `${OUT}/evidence/${prefix}quota-${repeat}-retry-stuck.png` });
      await button(s.page, 'Keep drawing').click();
      await expect(s.page.getByRole('dialog')).toHaveCount(0);
      await launch();
      await expect(button(s.page, 'Download')).toHaveCount(0);
      await expect(
        s.page.getByRole('heading', { name: /Still not working|Hmm, that didn't work/ })
      ).toBeVisible();
      await land(s);
      const reopened = await s.page.locator('body').ariaSnapshot();
      await s.page.screenshot({ path: `${OUT}/evidence/${prefix}quota-${repeat}-reopened.png` });
      await boot(s);
      await stroke(s);
      await launch();
      await expect(button(s.page, 'Download')).toBeVisible({ timeout: 15000 });
      await land(s);
      expect(log.filter((r) => r.path === '/api/generate-image').length).toBe(1);
      await s.page.screenshot({
        path: `${OUT}/evidence/${prefix}quota-${repeat}-reload-recovers.png`,
      });
      results.push({
        engine: ENGINE,
        repeat,
        failedWrites,
        uploadBeforeReload: 0,
        reopeningFailed: true,
        reopened,
        reloadRecovered: true,
        requests: log,
      });
    } finally {
      await s.ctx.close();
    }
  }
  writeFileSync(
    `${OUT}/evidence/${prefix}ai-quota-recovery.json`,
    JSON.stringify(results, null, 2) + '\n'
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}

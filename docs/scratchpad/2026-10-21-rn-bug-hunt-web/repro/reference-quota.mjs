import { writeFileSync } from 'node:fs';
import { connect, open, expect, OUT } from './driver.mjs';
import { land } from './ui.mjs';
import {
  boot,
  openSettings,
  openSection,
  contact,
  expandDrawer,
} from '../../2026-10-18-device-parity/results/web/harness.mjs';
import {
  installAiFixture,
  AI_REPLIES,
} from '../../2026-10-18-device-parity/results/web/ai-fixture.mjs';

const browser = await connect();
try {
  const s = await open(browser, 'phone');
  Object.assign(s, {
    base: 'http://127.0.0.1:6151',
    paper: '#drawingCanvas',
    profile: 'iphone',
    arm: 'web-prod',
  });
  const log = await installAiFixture(s.ctx, { '/api/generate-image': [AI_REPLIES.picture()] });
  try {
    await boot(s);
    await openSettings(s);
    await openSection(s, 'AI Art');
    for (const [name, value] of [
      ['Create AI Images', true],
      ['Customize AI Style', true],
      ['Auto-Save AI Images', false],
    ]) {
      const t = s.page.getByRole('switch', { name, exact: true }).filter({ visible: true }).first();
      if ((await t.isChecked()) !== value) await t.click();
      await expect(t).toBeChecked({ checked: value });
    }
    await s.page.keyboard.press('Escape');
    await expect(s.page.getByRole('dialog')).toHaveCount(0);
    await contact(s, [
      [
        [0.25, 0.35],
        [0.45, 0.42],
        [0.6, 0.38],
      ],
    ]);
    await expandDrawer(s);
    await s.page.evaluate(() => {
      window.__refusedWrites = [];
      IDBObjectStore.prototype.put = function () {
        window.__refusedWrites.push({ db: this.transaction.db.name, store: this.name });
        throw new DOMException('Named comparison quota fixture', 'QuotaExceededError');
      };
    });
    await s.page
      .getByRole('button', { name: /AI image/ })
      .filter({ visible: true })
      .first()
      .click();
    await expect(s.page.getByRole('button', { name: 'Sticker', exact: true })).toBeVisible();
    await land(s);
    await s.page.getByRole('button', { name: 'Sticker', exact: true }).click();
    await expect(s.page.getByRole('button', { name: 'Download', exact: true })).toBeVisible({
      timeout: 15000,
    });
    await land(s);
    expect(log.filter((x) => x.path === '/api/generate-image').length).toBe(1);
    const refused = await s.page.evaluate(() => window.__refusedWrites);
    const result = {
      source: 'shipping reference at b236d639160459eecd60900926c759af5d4ae080',
      writesRefusedAfterSetup: refused,
      fixtureGenerationSucceeded: true,
      requests: log,
      limits:
        'Shipping has no equivalent durable pre-upload AI preparation record; blocked IDB writes after setup do not exercise the RN storage owner.',
    };
    await s.page.screenshot({ path: `${OUT}/evidence/reference-quota-result.png` });
    writeFileSync(`${OUT}/evidence/reference-quota.json`, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result));
  } finally {
    await s.ctx.close();
  }
} finally {
  await browser.close();
}

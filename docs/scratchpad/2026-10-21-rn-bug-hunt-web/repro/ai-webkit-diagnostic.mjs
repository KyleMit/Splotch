import { writeFileSync } from 'node:fs';
import { connect, open, boot, button, stroke, OUT, ENGINE, record, expect } from './driver.mjs';
import { settings, land } from './ui.mjs';
import {
  installAiFixture,
  AI_REPLIES,
} from '../../2026-10-18-device-parity/results/web/ai-fixture.mjs';

const browser = await connect();
try {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const s = await open(browser, 'phone');
    await s.ctx.addInitScript(() => {
      window.__diagnostics = [];
      const dataUrl = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (...args) {
        const result = dataUrl.apply(this, args);
        if (result.startsWith('data:image/png;base64,'))
          window.__diagnostics.push({ operation: 'canvas-png', base64: result.split(',')[1] });
        return result;
      };
      const decode = HTMLImageElement.prototype.decode;
      HTMLImageElement.prototype.decode = async function () {
        try {
          const result = await decode.call(this);
          window.__diagnostics.push({
            operation: 'decode',
            ok: true,
            width: this.naturalWidth,
            height: this.naturalHeight,
          });
          return result;
        } catch (error) {
          window.__diagnostics.push({
            operation: 'decode',
            ok: false,
            error: String(error),
            stack: error.stack,
          });
          throw error;
        }
      };
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        window.__diagnostics.push({ operation: 'put', database: this.transaction.db.name });
        return put.apply(this, args);
      };
      const create = URL.createObjectURL;
      URL.createObjectURL = function (blob) {
        if (blob.type === 'image/png') {
          void blob.arrayBuffer().then((bytes) =>
            window.__diagnostics.push({
              operation: 'png',
              bytes: Array.from(new Uint8Array(bytes)),
            })
          );
        }
        return create.call(this, blob);
      };
    });
    const log = await installAiFixture(s.ctx, { '/api/generate-image': [AI_REPLIES.picture()] });
    try {
      await boot(s);
      await settings(s, 'AI Art');
      for (const [name, enabled] of [
        ['Create AI Images', true],
        ['Customize AI Style', true],
        ['Auto-Save AI Images', false],
      ]) {
        const control = s.page.getByRole('switch', { name, exact: true });
        if (((await control.getAttribute('aria-checked')) === 'true') !== enabled)
          await control.click();
      }
      await s.page.keyboard.press('Escape');
      await expect(s.page.getByRole('dialog')).toHaveCount(0);
      await stroke(s);
      await record(s, `A01-WebKit-preupload-diagnostic-${attempt}`, async () => {
        await s.page.getByRole('button', { name: /Create AI image/ }).click();
        await expect(button(s.page, 'Sticker')).toBeVisible();
        await land(s);
        await button(s.page, 'Sticker').click();
        await expect(button(s.page, 'Download').or(button(s.page, 'Try again'))).toBeVisible({
          timeout: 20000,
        });
        const diagnostics = await s.page.evaluate(() => window.__diagnostics);
        for (const [i, entry] of diagnostics.entries()) {
          if (entry.operation === 'canvas-png') {
            writeFileSync(
              `${OUT}/evidence/${ENGINE}-ai-canvas-${attempt}-${i}.png`,
              Buffer.from(entry.base64, 'base64')
            );
            entry.base64 = entry.base64.length;
          }
          if (entry.operation === 'png') {
            writeFileSync(
              `${OUT}/evidence/${ENGINE}-ai-original-${attempt}-${i}.png`,
              Buffer.from(entry.bytes)
            );
            entry.bytes = entry.bytes.length;
          }
        }
        const result = {
          attempt,
          diagnostics,
          requests: log,
          tree: await s.page.locator('body').ariaSnapshot(),
        };
        writeFileSync(
          `${OUT}/evidence/${ENGINE}-ai-diagnostic-${attempt}.json`,
          JSON.stringify(result, null, 2) + '\n'
        );
        return result;
      });
    } finally {
      await s.ctx.close();
    }
  }
} finally {
  await browser.close();
}

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
} from './driver.mjs';
import { settings, land } from './ui.mjs';

const browser = await connect();
const DOWNLOAD_BOOKS_TIMEOUT_MS = 240000;
try {
  const s = await open(browser, 'phone');
  let release,
    held = false;
  const barrier = new Promise((done) => (release = done));
  await s.ctx.route('**/coloring/dinosaur/cover.thumb.webp', async (route) => {
    held = true;
    await barrier;
    await route.continue();
  });
  try {
    await boot(s);
    await record(s, 'C02-C03-C04-S06-library', async () => {
      await button(s.page, 'Coloring books').click();
      await expect(s.page.getByRole('dialog')).toBeVisible();
      await s.page.keyboard.press('Escape');
      await expect(s.page.getByRole('dialog')).toHaveCount(0);
      await expect.poll(() => held, { timeout: 15000 }).toBe(true);
      await stroke(s);
      expect(await undoDepth(s)).toBe(1);
      release();
      await settings(s, 'Coloring');
      const line = () => s.page.getByRole('dialog').innerText();
      await expect
        .poll(
          async () => {
            const m = (await line()).match(/(\d+) of (\d+) extra books/);
            return m && Number(m[1]) === Number(m[2]);
          },
          { timeout: DOWNLOAD_BOOKS_TIMEOUT_MS, intervals: [1000] }
        )
        .toBe(true);
      const installed = await line();
      await s.page.screenshot({ path: `${OUT}/evidence/${ENGINE}-library-installed.png` });
      await s.page.keyboard.press('Escape');
      await expect(s.page.getByRole('dialog')).toHaveCount(0);
      await s.ctx.setOffline(true);
      await button(s.page, 'Coloring books').click();
      await land(s);
      const back = button(s.page, 'Back');
      if (await back.isVisible()) await back.click();
      await expect(button(s.page, 'Dinosaurs coloring book')).toBeVisible();
      await button(s.page, 'Dinosaurs coloring book').click();
      await land(s);
      await button(s.page, 'Brachiosaurus coloring page').click();
      await expect(s.page.getByRole('dialog')).toHaveCount(0);
      const art = await paperDigest(s);
      await stroke(s);
      expect(await paperDigest(s)).not.toBe(art);
      expect(await undoDepth(s)).toBe(1);
      await settings(s, 'Coloring');
      await button(s.page, 'Remove downloaded pictures').click();
      await expect.poll(() => line(), { timeout: 20000 }).toMatch(/0 of \d+ extra books/);
      const removed = await line();
      await s.page.keyboard.press('Escape');
      await expect(s.page.getByRole('dialog')).toHaveCount(0);
      await button(s.page, 'Coloring books').click();
      await land(s);
      const bookBack = button(s.page, 'Back');
      if (await bookBack.isVisible()) await bookBack.click();
      const farm = button(s.page, 'Farm coloring book');
      if (await farm.isVisible()) {
        await farm.click();
        await land(s);
      }
      await expect(button(s.page, 'Cat coloring page')).toBeVisible();
      await button(s.page, 'Cat coloring page').click();
      await expect(s.page.getByRole('dialog')).toHaveCount(0);
      await stroke(s);
      expect(await undoDepth(s)).toBe(1);
      return {
        heldDownloadDidNotBlockInk: true,
        installed,
        extraBookDrewOffline: true,
        removed,
        starterSurvivedRemovalOffline: true,
        limits:
          'Named held asset fixture; Save-Data policy and cancel-in-flight removal remain separate.',
      };
    });
  } finally {
    release();
    await s.ctx.setOffline(false);
    await s.ctx.close();
  }
  appendFileSync(
    `${OUT}/status.md`,
    `\n- ${new Date().toISOString()} — ${ENGINE} library case ended: held extra-book asset, drawing while pending, download inventory, offline extra-book selection, removal and starter retention attempted.\n`
  );
} finally {
  await browser.close();
}

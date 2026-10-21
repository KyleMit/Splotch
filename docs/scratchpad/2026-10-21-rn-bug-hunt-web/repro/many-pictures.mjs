import { appendFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { connect, open, boot, button, record, expect, OUT, ENGINE, stroke } from './driver.mjs';

const PICTURE_COUNT = 25;
const browser = await connect();
try {
  const s = await open(browser, 'phone');
  await s.ctx.addInitScript(() => {
    const live = new Map(),
      links = [];
    let createdPNG = 0;
    const create = URL.createObjectURL,
      revoke = URL.revokeObjectURL,
      click = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = function (blob) {
      const url = create.call(this, blob);
      live.set(url, blob.type);
      if (blob.type === 'image/png') createdPNG++;
      return url;
    };
    URL.revokeObjectURL = function (url) {
      live.delete(url);
      return revoke.call(this, url);
    };
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) links.push(this.href);
      return click.call(this);
    };
    window.__saveUrlState = () => ({
      createdPNG,
      downloadLinks: links.length,
      retainedDownloadUrls: links.filter((url) => live.has(url)).length,
      retainedByType: [...live.values()].reduce(
        (counts, type) => ({ ...counts, [type]: (counts[type] ?? 0) + 1 }),
        {}
      ),
    });
  });
  try {
    await boot(s);
    await record(s, 'P02-W12-many-pictures', async () => {
      const downloads = [];
      s.page.on('download', (d) => downloads.push(d));
      const images = [];
      const estimateBefore = await s.page.evaluate(() => navigator.storage.estimate());
      for (let i = 0; i < PICTURE_COUNT; i++) {
        const y = 0.25 + i * 0.017;
        await stroke(s, [
          [
            [0.25, y],
            [0.45, y + 0.04],
            [0.65, y + 0.02],
          ],
        ]);
        const target = i + 1;
        await expect(async () => {
          if (downloads.length < target) await button(s.page, 'Save screenshot').click();
          expect(downloads.length).toBe(target);
        }).toPass({ timeout: 12000, intervals: [500] });
        const stream = await downloads[i].createReadStream();
        expect(stream).not.toBeNull();
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        const bytes = Buffer.concat(chunks);
        const meta = await sharp(bytes).metadata();
        expect(meta.format).toBe('png');
        images.push({
          name: downloads[i].suggestedFilename(),
          bytes: bytes.length,
          width: meta.width,
          height: meta.height,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          pixelSha256: createHash('sha256')
            .update(await sharp(bytes).ensureAlpha().raw().toBuffer())
            .digest('hex'),
        });
        if (i === 0 || i === PICTURE_COUNT - 1)
          writeFileSync(`${OUT}/evidence/${ENGINE}-picture-stress-${i + 1}.png`, bytes);
      }
      expect(new Set(images.map((i) => i.sha256)).size).toBe(PICTURE_COUNT);
      expect(new Set(images.map((i) => i.pixelSha256)).size).toBe(PICTURE_COUNT);
      const urls = await s.page.evaluate(() => window.__saveUrlState());
      expect(urls.createdPNG).toBeGreaterThanOrEqual(PICTURE_COUNT);
      expect(urls.downloadLinks).toBe(PICTURE_COUNT);
      expect(urls.retainedDownloadUrls).toBe(0);
      const estimateAfter = await s.page.evaluate(() => navigator.storage.estimate());
      await boot(s);
      await expect(button(s.page, 'Undo')).toBeDisabled();
      const result = {
        count: PICTURE_COUNT,
        distinctPictures: PICTURE_COUNT,
        distinctDecodedPictures: PICTURE_COUNT,
        urls,
        estimateBefore,
        estimateAfter,
        images,
        reloadStartsBlank: true,
        limits:
          'Download object URLs checked directly; total storage estimates also include automatic book downloads. Heap collection and real quota exhaustion are not inferred.',
      };
      writeFileSync(
        `${OUT}/evidence/${ENGINE}-many-pictures.json`,
        JSON.stringify(result, null, 2) + '\n'
      );
      return result;
    });
  } finally {
    await s.ctx.close();
  }
  appendFileSync(
    `${OUT}/status.md`,
    `\n- ${new Date().toISOString()} — ${ENGINE} repeated-save case ended: 25 distinct PNG downloads, cooldown behavior and download object-URL release attempted; result receipt saved.\n`
  );
} finally {
  await browser.close();
}

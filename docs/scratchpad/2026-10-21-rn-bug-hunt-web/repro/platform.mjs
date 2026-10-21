import { appendFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
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
import { land, settings } from './ui.mjs';
import { paperDifference } from './pixels.mjs';

const browser = await connect();
try {
  for (const profile of (process.env.HUNT_PROFILES ?? 'phone,tablet,desktop,narrow').split(',')) {
    const cases = {
      'C01-P01-farm-composite': async (s) => {
        const images = [];
        s.page.on('response', (r) => {
          if (new URL(r.url()).pathname.startsWith('/coloring/'))
            images.push({
              path: new URL(r.url()).pathname,
              status: r.status(),
              mime: r.headers()['content-type'],
            });
        });
        const blank = await paperDigest(s);
        await button(s.page, 'Coloring books').click();
        await land(s);
        await button(s.page, 'Cat coloring page').click();
        await expect(s.page.getByRole('dialog')).toHaveCount(0);
        const art = await paperDigest(s);
        const artFrame = s.lastPaperFrame;
        await sharp(s.lastPaperFrame).toFile(
          `${OUT}/evidence/${ENGINE}-${profile}-farm-before-ink.png`
        );
        expect(art).not.toBe(blank);
        await stroke(s);
        const ink = await paperDigest(s);
        const inkFrame = s.lastPaperFrame;
        await sharp(s.lastPaperFrame).toFile(
          `${OUT}/evidence/${ENGINE}-${profile}-farm-ink-crop.png`
        );
        expect(ink).not.toBe(art);
        const downloaded = s.page.waitForEvent('download');
        await button(s.page, 'Save screenshot').click();
        const d = await downloaded;
        const path = `${OUT}/evidence/${ENGINE}-${profile}-farm.png`;
        await d.saveAs(path);
        const metadata = await sharp(path).metadata();
        expect(metadata.format).toBe('png');
        await button(s.page, 'Clear drawing').focus();
        await s.page.keyboard.press('Enter');
        await land(s);
        const cleared = await paperDigest(s);
        expect(cleared).not.toBe(blank);
        await sharp(s.lastPaperFrame).toFile(
          `${OUT}/evidence/${ENGINE}-${profile}-farm-cleared-crop.png`
        );
        const artDifference = await paperDifference(artFrame, s.lastPaperFrame);
        expect(artDifference.fringeViolations).toBe(0);
        await button(s.page, 'Undo').click();
        await land(s);
        await paperDigest(s);
        const undoDifference = await paperDifference(inkFrame, s.lastPaperFrame);
        expect(undoDifference.fringeViolations).toBe(0);
        writeFileSync(
          `${OUT}/evidence/${ENGINE}-${profile}-coloring-network.json`,
          JSON.stringify(images, null, 2) + '\n'
        );
        return {
          artVisible: true,
          inkVisible: true,
          clearKeptArt: true,
          undoRestoredInk: true,
          artDifference,
          undoDifference,
          png: { width: metadata.width, height: metadata.height },
          coloringRequests: images.length,
          badColoringResponses: images.filter(
            (r) => r.status !== 200 || !/^image\//.test(r.mime ?? '')
          ),
          networkReceipt: `evidence/${ENGINE}-${profile}-coloring-network.json`,
          limits:
            'Clear via keyboard; raster comparisons permit a documented one-pixel AA envelope. PNG composite visual review separate.',
        };
      },
      'D12-short-full-clear-drag': async (s) => {
        await stroke(s);
        const ink = await paperDigest(s);
        const originalFrame = s.lastPaperFrame;
        await sharp(s.lastPaperFrame).toFile(
          `${OUT}/evidence/${ENGINE}-${profile}-clear-original-crop.png`
        );
        const target = await button(s.page, 'Clear drawing').boundingBox();
        const x = Math.min(target.x + target.width / 2, s.page.viewportSize().width - 15),
          y = target.y + target.height / 2;
        await s.page.mouse.move(x, y);
        await s.page.mouse.down();
        await s.page.mouse.move(x - 25, y + 10, { steps: 8 });
        await s.page.mouse.up();
        await land(s);
        const short = await paperDigest(s);
        await sharp(s.lastPaperFrame).toFile(
          `${OUT}/evidence/${ENGINE}-${profile}-clear-short-crop.png`
        );
        const shortDifference = await paperDifference(originalFrame, s.lastPaperFrame);
        expect(shortDifference.fringeViolations).toBe(0);
        await s.page.mouse.move(x, y);
        await s.page.mouse.down();
        await s.page.mouse.move(x - s.page.viewportSize().width * 0.6, y + 100, { steps: 30 });
        await s.page.mouse.up();
        await land(s);
        expect(await paperDigest(s)).not.toBe(ink);
        await button(s.page, 'Undo').click();
        await land(s);
        const restored = await paperDigest(s);
        await sharp(s.lastPaperFrame).toFile(
          `${OUT}/evidence/${ENGINE}-${profile}-clear-restored-crop.png`
        );
        const restoreDifference = await paperDifference(originalFrame, s.lastPaperFrame);
        expect(restoreDifference.fringeViolations).toBe(0);
        expect(await undoDepth(s)).toBe(1);
        return {
          shortPreserved: true,
          fullCleared: true,
          undoRestored: true,
          restoreDifference,
          shortDifference,
          shortDigest: short,
          restoredDigest: restored,
          input: 'trusted mouse',
          limits: 'Touch clear and reverse drag separate.',
        };
      },
      'W05-eraser-hover': async (s) => {
        await button(s.page, 'Brushes').click();
        await button(s.page, 'Eraser').click();
        await land(s);
        const box = await s.page.locator('[data-testid="drawing-paper"]').boundingBox();
        await s.page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
        await expect(s.page.locator('[data-testid="pointer-halos"]')).toBeVisible();
        await expect(s.page.locator('[data-testid="drawing-paper"]')).toHaveCSS('cursor', 'none');
        await s.page.screenshot({ path: `${OUT}/evidence/${ENGINE}-${profile}-eraser-hover.png` });
        await button(s.page, 'Purple').hover();
        await expect(s.page.locator('[data-testid="pointer-halos"]')).toHaveCount(0);
        expect(await undoDepth(s)).toBe(0);
        return { bubbleShown: true, bubbleLeft: true, hoverPainted: false, input: 'trusted mouse' };
      },
      'W08-root-overflow': async (s) => {
        const overflow = await s.page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          width: innerWidth,
          height: innerHeight,
        }));
        expect(overflow.scroll).toBeLessThanOrEqual(overflow.width);
        await button(s.page, 'Custom Color').click();
        await land(s);
        const box = await s.page.locator('[data-testid="color-picker-card"]').boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(overflow.width + 1);
        return {
          overflow,
          picker: box,
          limits: 'Root and picker bounds only; Settings cases separately.',
        };
      },
    };
    for (const [id, run] of Object.entries(cases)) {
      const s = await open(browser, profile);
      try {
        await boot(s);
        await record(s, id, () => run(s));
      } finally {
        await s.ctx.close();
      }
    }
  }
  for (const mode of ['dark', 'reduce', 'forced', 'text200', 'cssZoom200']) {
    const s = await open(
      browser,
      'phone',
      mode === 'dark'
        ? { colorScheme: 'dark' }
        : mode === 'reduce'
          ? { reducedMotion: 'reduce' }
          : mode === 'forced'
            ? { forcedColors: 'active' }
            : {}
    );
    try {
      await boot(s);
      await record(s, `X01-X03-W09-W10-${mode}`, async () => {
        if (mode === 'text200') await s.page.addStyleTag({ content: 'html { font-size: 200%; }' });
        if (mode === 'cssZoom200') await s.page.addStyleTag({ content: 'html { zoom: 2; }' });
        await settings(s, 'Accessibility');
        await expect(
          s.page.getByRole('heading', { name: 'Accessibility', exact: true })
        ).toBeVisible();
        await button(s.page, 'Close').click();
        await expect(s.page.getByRole('dialog')).toHaveCount(0);
        await stroke(s);
        expect(await undoDepth(s)).toBe(1);
        const media = await s.page.evaluate(() => ({
          dark: matchMedia('(prefers-color-scheme: dark)').matches,
          reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
          forced: matchMedia('(forced-colors: active)').matches,
          font: getComputedStyle(document.documentElement).fontSize,
          zoom: getComputedStyle(document.documentElement).zoom,
        }));
        if (['dark', 'reduce', 'forced'].includes(mode)) expect(media[mode]).toBe(true);
        return {
          mode,
          media,
          drawerAndSettingsReachable: true,
          drawAndUndo: true,
          limits:
            'CSS zoom is a labeled surrogate, not browser chrome zoom; complete section/layout inspection remains separate.',
        };
      });
    } finally {
      await s.ctx.close();
    }
  }
  appendFileSync(
    `${OUT}/status.md`,
    `\n- ${new Date().toISOString()} — ${ENGINE} platform batch ended: Farm composite, clear, eraser hover, narrow bounds and appearance/media fixtures attempted.\n`
  );
} finally {
  await browser.close();
}

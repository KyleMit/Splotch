import { appendFileSync } from 'node:fs';
import sharp from 'sharp';
import { land } from './ui.mjs';
import { paperDifference } from './pixels.mjs';
import {
  connect,
  open,
  boot,
  button,
  brush,
  closeOverlays,
  stroke,
  undoDepth,
  paperDigest,
  record,
  expect,
  ENGINE,
  OUT,
} from './driver.mjs';

const browser = await connect();
process.env.HUNT_RESET_EACH = '1';
try {
  for (const profile of (process.env.HUNT_PROFILES ?? 'phone,tablet,desktop').split(',')) {
    const s = await open(browser, profile);
    try {
      await boot(s);
      await record(s, 'D02-D05-brush-ink-undo', async () => {
        const observations = [];
        for (const name of ['Pen', 'Crayon', 'Magic brush']) {
          await brush(s, name);
          const before = await paperDigest(s);
          await stroke(s);
          const after = await paperDigest(s);
          expect(after).not.toBe(before);
          const depth = await undoDepth(s);
          expect(depth).toBe(1);
          expect(await paperDigest(s)).toBe(before);
          observations.push({ name, changedPixels: before !== after, undo: depth, restored: true });
        }
        await brush(s, 'Pen');
        await stroke(s);
        const ink = await paperDigest(s);
        const original = s.lastPaperFrame;
        await sharp(original).toFile(`${OUT}/evidence/${ENGINE}-${profile}-eraser-original.png`);
        await brush(s, 'Eraser');
        await stroke(s);
        const erased = await paperDigest(s);
        expect(erased).not.toBe(ink);
        await button(s.page, 'Undo').click();
        await paperDigest(s);
        const restored = s.lastPaperFrame;
        await sharp(restored).toFile(`${OUT}/evidence/${ENGINE}-${profile}-eraser-restored.png`);
        const restoreDifference = await paperDifference(original, restored);
        expect(restoreDifference.fringeViolations).toBe(0);
        await undoDepth(s);
        return {
          observations,
          erased: true,
          eraserUndoRestored: true,
          restorePixelDifference: restoreDifference,
          limits:
            'Eraser Undo permits a one-pixel AA envelope; originals saved for visual review. One path per brush; dot and edge-clipping not yet judged.',
        };
      });
      await record(s, 'D08-palette', async () => {
        await brush(s, 'Pen');
        const colors = [];
        for (const name of ['Purple', 'Blue', 'Green', 'Yellow', 'Black']) {
          await button(s.page, name).click();
          await stroke(s);
          colors.push({ name, digest: await paperDigest(s) });
          expect(await undoDepth(s)).toBe(1);
        }
        expect(new Set(colors.map((c) => c.digest)).size).toBe(5);
        return {
          distinctRenderedColors: colors.length,
          limits: 'Color difference established; exact token RGB not asserted.',
        };
      });
      await record(s, 'D09-custom-color', async () => {
        await brush(s, 'Pen');
        await button(s.page, 'Custom Color').click();
        const picker = s.page.getByRole('dialog', { name: 'Color Picker' });
        await expect(picker).toBeVisible();
        await land(s);
        const hex = button(s.page, '#E63946');
        const box = await hex.boundingBox();
        await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await expect(picker).toHaveCount(0);
        await stroke(s);
        const custom = await paperDigest(s);
        await undoDepth(s);
        await button(s.page, 'Purple').click();
        await stroke(s);
        const purple = await paperDigest(s);
        await undoDepth(s);
        expect(custom).not.toBe(purple);
        await button(s.page, 'Custom Color').click();
        await expect(button(s.page, '#E63946')).toBeVisible();
        await closeOverlays(s);
        return {
          customColorRendered: true,
          reopened: true,
          limits: 'Grid pointer tap; recall ring and drag/scrim not yet asserted.',
        };
      });
      await record(s, 'D10-widths', async () => {
        const widths = [];
        for (const name of ['Pen', 'Eraser']) {
          await brush(s, name);
          for (let size = 1; size <= 5; size++) {
            await button(s.page, 'Stroke width').click();
            const label = `${name === 'Eraser' ? 'Eraser size' : 'Size'} ${size}`;
            await expect(button(s.page, label)).toBeVisible();
            await button(s.page, label).click();
            await expect(s.page.getByRole('group', { name: 'Stroke Width Menu' })).toHaveCount(0);
            await button(s.page, 'Stroke width').click();
            await expect(button(s.page, label)).toHaveAttribute('aria-pressed', 'true');
            await closeOverlays(s);
            widths.push(`${name}:${size}`);
          }
        }
        return {
          selected: widths,
          limits:
            'Selection states only; actual pixel width and brush-specific persistence remain separate.',
        };
      });
      await record(s, 'D11-deep-history', async () => {
        await brush(s, 'Pen');
        for (let i = 0; i < 25; i++)
          await stroke(s, [
            [
              [0.25, 0.3 + (i % 5) * 0.08],
              [0.6, 0.31 + (i % 5) * 0.08],
            ],
          ]);
        const depth = await undoDepth(s);
        expect(depth).toBe(20);
        await expect(button(s.page, 'Undo')).toBeDisabled();
        return {
          commands: 25,
          undone: depth,
          limits:
            'The shared MAX_UNDO_DEPTH is 20; stroke/point-cap removal did not remove the Undo cap.',
        };
      });
      await record(s, 'P01-P02-download', async () => {
        await stroke(s);
        const downloads = [];
        s.page.on('download', (d) => downloads.push(d));
        await button(s.page, 'Save screenshot').click();
        await expect.poll(() => downloads.length).toBe(1);
        const path = `${OUT}/evidence/${ENGINE}-${profile}-drawing.png`;
        await downloads[0].saveAs(path);
        const meta = await sharp(path).metadata();
        expect(meta.format).toBe('png');
        expect(meta.width).toBeGreaterThan(100);
        expect(meta.height).toBeGreaterThan(100);
        return {
          download: downloads[0].suggestedFilename(),
          format: meta.format,
          width: meta.width,
          height: meta.height,
          limits: 'One save of blank-background ink; no Farm composite or repeated cooldown yet.',
        };
      });
    } finally {
      await s.ctx.close();
    }
  }
  appendFileSync(
    `${OUT}/status.md`,
    `\n- ${new Date().toISOString()} — ${ENGINE.toUpperCase()} drawing batch ended: brush/palette/custom-color/width/history/download observations recorded for requested profiles. BLOCKED cases require driver triage before defect classification.\n`
  );
} finally {
  await browser.close();
}

import { appendFileSync } from 'node:fs';
import {
  connect,
  open,
  boot,
  button,
  brush,
  record,
  expect,
  OUT,
  ENGINE,
  stroke,
  undoDepth,
  paperDigest,
} from './driver.mjs';
import { paperDifference } from './pixels.mjs';
import { land, settings } from './ui.mjs';

const browser = await connect();
try {
  const s = await open(browser, 'phone');
  try {
    await boot(s);
    await record(s, 'D04-D05-page-magic-eraser-theme', async () => {
      await button(s.page, 'Coloring books').click();
      await land(s);
      await button(s.page, 'Cat coloring page').click();
      await expect(s.page.getByRole('dialog')).toHaveCount(0);
      const outline = await paperDigest(s),
        outlineFrame = s.lastPaperFrame;
      await brush(s, 'Magic brush');
      await stroke(s);
      const revealed = await paperDigest(s),
        revealedFrame = s.lastPaperFrame;
      expect(revealed).not.toBe(outline);
      await s.page.screenshot({ path: `${OUT}/evidence/${ENGINE}-farm-magic-light.png` });
      await brush(s, 'Eraser');
      await stroke(s);
      await paperDigest(s);
      const erased = await paperDifference(outlineFrame, s.lastPaperFrame);
      expect(erased.fringeViolations).toBe(0);
      await button(s.page, 'Undo').click();
      await paperDigest(s);
      const restored = await paperDifference(revealedFrame, s.lastPaperFrame);
      expect(restored.fringeViolations).toBe(0);
      expect(await undoDepth(s)).toBe(1);
      await settings(s, 'Appearance');
      await s.page.getByRole('radio', { name: 'Dark', exact: true }).click();
      await s.page.keyboard.press('Escape');
      await expect(s.page.getByRole('dialog')).toHaveCount(0);
      const dark = await paperDigest(s);
      expect(dark).not.toBe(outline);
      await brush(s, 'Magic brush');
      await stroke(s);
      expect(await paperDigest(s)).not.toBe(dark);
      await s.page.screenshot({ path: `${OUT}/evidence/${ENGINE}-farm-magic-dark.png` });
      return {
        lightMagicChangedArt: true,
        eraserRestoredOutline: true,
        undoRestoredMagic: true,
        darkArtChanged: true,
        darkMagicPainted: true,
        erased,
        restored,
        limits:
          'One path on Farm; fill registration and texture are judged from originals, not the envelope score.',
      };
    });
  } finally {
    await s.ctx.close();
  }
  appendFileSync(
    `${OUT}/status.md`,
    `\n- ${new Date().toISOString()} — ${ENGINE} coloring-brush case ended: Magic reveal, erasure, Undo and light/night page-art switching attempted.\n`
  );
} finally {
  await browser.close();
}

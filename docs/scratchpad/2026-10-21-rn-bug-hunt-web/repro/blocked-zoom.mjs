import { connect, open, boot, button, record, expect, ENGINE, OUT } from './driver.mjs';
import { settings } from './ui.mjs';
import { appendFileSync } from 'node:fs';
const browser = await connect();
try {
  const s = await open(browser, 'phone');
  try {
    await boot(s);
    await record(s, 'X01-X03-W09-W10-cssZoom200', async () => {
      await s.page.addStyleTag({ content: 'html { zoom: 2; }' });
      await settings(s, 'Accessibility');
      await expect(
        s.page.getByRole('heading', { name: 'Accessibility', exact: true })
      ).toBeVisible();
      const before = await button(s.page, 'Close').boundingBox();
      await s.page.keyboard.press('Escape');
      await expect(s.page.getByRole('dialog')).toHaveCount(0);
      const paper = await s.page.locator('[data-testid="drawing-paper"]').boundingBox(),
        viewport = s.page.viewportSize();
      const left = Math.max(0, paper.x),
        top = Math.max(0, paper.y),
        right = Math.min(viewport.width, paper.x + paper.width),
        bottom = Math.min(viewport.height, paper.y + paper.height);
      const start = { x: left + (right - left) * 0.35, y: top + (bottom - top) * 0.4 };
      await s.page.mouse.move(start.x, start.y);
      await s.page.mouse.down();
      for (let i = 1; i <= 12; i++) {
        await s.page.mouse.move(
          start.x + ((right - left) * 0.25 * i) / 12,
          start.y + (20 * i) / 12
        );
        await new Promise((r) => setTimeout(r, 12));
      }
      await s.page.mouse.up();
      await expect(button(s.page, 'Undo')).toBeEnabled();
      await s.page.keyboard.press('Control+z');
      await expect(button(s.page, 'Undo')).toBeDisabled();
      return {
        surrogate: 'CSS zoom 2',
        settingsEntered: true,
        dismissal: 'Escape',
        closeButtonBefore: before,
        drawAndUndo: true,
        limits:
          'This completes the CSS surrogate using a keyboard dismissal. The Close pointer target remains outside the viewport; real browser-chrome zoom cannot be set by this remote Playwright browser connection and stays unproven. No actual browser zoom verdict.',
      };
    });
  } finally {
    await s.ctx.close();
  }
} finally {
  await browser.close();
  appendFileSync(
    `${OUT}/status.md`,
    `\n- ${new Date().toISOString()} — ${ENGINE} CSS zoom surrogate revisited with keyboard Escape; actual browser-chrome zoom remains outside protocol access.\n`
  );
}

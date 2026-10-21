import { appendFileSync, mkdirSync } from 'node:fs';
import { connect, open, boot, expect, ENGINE, OUT } from './driver.mjs';
import { settings } from './ui.mjs';
import { fontsReady, receipt } from './pages-run4.mjs';
import { SOUND_SETTINGS_KEY } from '../../../../experiments/native-architecture/src/platform/soundSettings.web.ts';
import { BOOT_THEME_ATTRIBUTE } from '../../../../experiments/native-architecture/src/platform/bootTheme.ts';
import { DRAWING_THEMES } from '../../../../experiments/native-architecture/src/drawing/theme.ts';

const browser = await connect();
mkdirSync(`${OUT}/evidence/run4/themes`, { recursive: true });
const rgb = (hex) => {
  const expanded =
    hex.length === 4
      ? hex
          .slice(1)
          .split('')
          .map((c) => c + c)
          .join('')
      : hex.slice(1);
  return [...Buffer.from(expanded, 'hex')];
};
try {
  for (let repeat = 1; repeat <= 2; repeat++) {
    for (const desired of ['light', 'dark']) {
      const os = desired === 'light' ? 'dark' : 'light';
      const s = await open(browser, 'phone', { colorScheme: os });
      try {
        await boot(s);
        await settings(s, 'Appearance');
        const choice = s.page.getByRole('radio', {
          name: desired === 'light' ? 'Light' : 'Dark',
          exact: true,
        });
        await choice.click();
        await expect(choice).toBeChecked();
        await expect
          .poll(() =>
            s.page.evaluate(
              (key) => JSON.parse(localStorage.getItem(key))?.appearance,
              SOUND_SETTINGS_KEY
            )
          )
          .toBe(desired);
        await s.page.keyboard.press('Escape');
        for (const path of [
          '/privacy',
          '/changelog',
          '/beta?os=ios',
          '/feedback',
          '/admin',
          '/design',
          '/theme-unknown',
        ]) {
          const row = {
            engine: ENGINE,
            repeat,
            desired,
            os,
            path,
            at: new Date().toISOString(),
            status: 'PASS',
          };
          try {
            await s.page.goto(`http://127.0.0.1:6150${path}`);
            await fontsReady(s.page);
            await expect(s.page.getByRole('heading', { level: 1 })).toBeVisible();
            expect(await s.page.locator('html').getAttribute(BOOT_THEME_ATTRIBUTE)).toBe(desired);
            await expect
              .poll(async () => {
                const color = await s.page
                  .getByRole('heading', { level: 1 })
                  .evaluate((e) => getComputedStyle(e).color);
                return color
                  .match(/[\d.]+/g)
                  .slice(0, 3)
                  .map(Number);
              })
              .toEqual(rgb(DRAWING_THEMES[desired].textStrong));
            expect(
              await s.page.evaluate(
                (key) => JSON.parse(localStorage.getItem(key))?.appearance,
                SOUND_SETTINGS_KEY
              )
            ).toBe(desired);
            row.read = await receipt(s.page);
            expect(s.errors).toEqual([]);
            expect(s.external).toEqual([]);
          } catch (error) {
            row.status = 'REVIEW';
            row.error = String(error.stack);
            row.read = await receipt(s.page).catch(() => null);
          }
          const id = `${ENGINE}-${repeat}-saved-${desired}-os-${os}-${path.split('?')[0].slice(1)}`;
          await s.page.screenshot({ path: `${OUT}/evidence/run4/themes/${id}.png` });
          appendFileSync(`${OUT}/evidence/run4/saved-themes.jsonl`, JSON.stringify(row) + '\n');
          console.log(
            JSON.stringify({
              engine: ENGINE,
              desired,
              os,
              path,
              status: row.status,
              error: row.error?.slice(0, 250),
            })
          );
        }
      } finally {
        await s.ctx.close();
      }
    }
  }
} finally {
  await browser.close();
}

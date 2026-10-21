import { chromium, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const out = 'docs/scratchpad/2026-10-21-rn-bug-hunt-web';
const browser = await chromium.connect('ws://127.0.0.1:6190/');
try {
  for (const [arm, port] of [
    ['rn', 6150],
    ['shipping', 6151],
  ]) {
    if (process.env.HUNT_ARM && process.env.HUNT_ARM !== arm) continue;
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: 'block',
    });
    await context.route('**/*', (r) =>
      new URL(r.request().url()).hostname === '127.0.0.1' &&
      !new URL(r.request().url()).pathname.startsWith('/api/')
        ? r.continue()
        : r.abort()
    );
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    if (arm === 'rn') await page.locator('html[data-drawing-live][data-controls-live]').waitFor();
    else
      await page.waitForFunction(() => {
        const c = document.querySelector('#drawingCanvas');
        return c && c.width !== 300;
      });
    await expect(async () => {
      if (!(await page.getByRole('dialog', { name: 'Settings', exact: true }).isVisible()))
        await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible({
        timeout: 1000,
      });
    }).toPass({ timeout: 15000 });
    await page.waitForTimeout(1800);
    writeFileSync(
      `${out}/evidence/${arm}-visual-settings-tree.txt`,
      await page.locator('body').ariaSnapshot()
    );
    await page
      .getByRole('button', { name: /^Appearance\b/ })
      .filter({ visible: true })
      .first()
      .click();
    await page.waitForTimeout(1000);
    await page.getByRole('radio', { name: 'Light', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
    writeFileSync(
      `${out}/evidence/${arm}-visual-seed.json`,
      JSON.stringify(
        await page.evaluate(() => Object.fromEntries(Object.entries(localStorage))),
        null,
        2
      )
    );
    await page.getByRole('button', { name: 'Expand controls', exact: true }).click();
    await page.waitForTimeout(1800);
    writeFileSync(
      `${out}/evidence/${arm}-visual-dom.json`,
      JSON.stringify(
        await page.evaluate(() =>
          [
            ...document.querySelectorAll(
              'button,[role="button"],[data-testid],.actions-panel,.actions-drawer,.color-palette'
            ),
          ].map((e) => ({
            tag: e.tagName,
            id: e.id,
            test: e.getAttribute('data-testid'),
            label: e.getAttribute('aria-label'),
            cls: e.className,
            box: e.getBoundingClientRect().toJSON(),
          }))
        ),
        null,
        2
      )
    );
    writeFileSync(
      `${out}/evidence/${arm}-visual-tree.txt`,
      await page.locator('body').ariaSnapshot()
    );
    await page.screenshot({ path: `${out}/evidence/${arm}-visual-inspect.png` });
    await context.close();
  }
} finally {
  await browser.close();
}

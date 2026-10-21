import { chromium, webkit, firefox, expect } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'node:fs';
import { localContext, fontsReady, BASE, EVIDENCE } from './pages-run4.mjs';

const engine = process.env.HUNT_ENGINE ?? 'chromium';
const arm = process.env.HUNT_ARM ?? 'rn';
const browser = await { chromium, webkit, firefox }[engine].connect('ws://127.0.0.1:6190/');
mkdirSync(`${EVIDENCE}/segments`, { recursive: true });
try {
  for (let repeat = 1; repeat <= 2; repeat++)
    for (const js of [true, false]) {
      const s = await localContext(browser, {
        viewport: { width: 390, height: 844 },
        javaScriptEnabled: js,
        colorScheme: 'light',
        reducedMotion: 'reduce',
      });
      const { page } = s;
      const id = `${arm}-${engine}-js${js ? 'on' : 'off'}-${repeat}`;
      const row = { id, arm, engine, js, repeat, at: new Date().toISOString() };
      try {
        await page.goto(`${BASE}/design`);
        await fontsReady(page);
        const group = page.getByRole('radiogroup', {
          name: arm === 'rn' ? 'Preview theme' : 'Theme',
          exact: true,
        });
        if (js) {
          for (const label of ['Dark', 'Light'])
            await expect(async () => {
              const control = group.getByRole('radio', { name: label, exact: true });
              await control.click();
              await expect(control).toHaveAttribute('aria-checked', 'true', { timeout: 250 });
            }).toPass({ timeout: 15000 });
        }
        row.geometry = await group.evaluate((group) => {
          const selected = group.querySelector('[aria-checked=true]');
          const r = selected.getBoundingClientRect();
          return {
            selected: selected.textContent,
            selectedColor: getComputedStyle(selected).color,
            track: getComputedStyle(group).backgroundColor,
            rect: { x: r.x, y: r.y, width: r.width, height: r.height },
            painted: [...group.querySelectorAll('*')]
              .map((e) => ({
                color: getComputedStyle(e).backgroundColor,
                width: e.getBoundingClientRect().width,
              }))
              .filter((e) => !['rgba(0, 0, 0, 0)', 'transparent'].includes(e.color)),
          };
        });
        await page.screenshot({ path: `${EVIDENCE}/segments/${id}.png` });
        row.errors = s.errors;
        row.external = s.external;
      } catch (error) {
        row.error = String(error.stack);
      } finally {
        await s.context.close();
        appendFileSync(`${EVIDENCE}/design-segments.jsonl`, JSON.stringify(row) + '\n');
        console.log(JSON.stringify(row));
      }
    }
} finally {
  await browser.close();
}

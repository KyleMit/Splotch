import { chromium, webkit, firefox, expect } from '@playwright/test';
import { appendFileSync } from 'node:fs';
import { localContext, fontsReady, BASE, EVIDENCE } from './pages-run4.mjs';

const SIDEBAR_WHEEL_DELTA_PX = 3_000;
const engine = process.env.HUNT_ENGINE ?? 'chromium';
const browser = await { chromium, webkit, firefox }[engine].connect('ws://127.0.0.1:6190/');
const rows = [];
try {
  for (let repeat = 1; repeat <= 2; repeat++) {
    const s = await localContext(browser, {
      viewport: { width: 1280, height: 800 },
      javaScriptEnabled: false,
    });
    try {
      await s.page.goto(`${BASE}/design`);
      await fontsReady(s.page);
      const nav = s.page
        .getByRole('navigation', { name: 'Contents', exact: true })
        .filter({ visible: true });
      const box = await nav.boundingBox();
      await s.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await s.page.mouse.wheel(0, SIDEBAR_WHEEL_DELTA_PX);
      await expect
        .poll(() => nav.evaluate((e) => e.scrollHeight - e.clientHeight - e.scrollTop))
        .toBeLessThanOrEqual(1);
      const last = nav.locator('a').last();
      const observation = await last.evaluate((e) => {
        const range = document.createRange();
        range.selectNodeContents(e);
        const r = range.getBoundingClientRect();
        return {
          label: e.textContent,
          textTop: r.top,
          textBottom: r.bottom,
          viewportHeight: innerHeight,
        };
      });
      const row = { engine, repeat, at: new Date().toISOString(), ...observation };
      rows.push(row);
      appendFileSync(`${EVIDENCE}/web006-minimal.jsonl`, JSON.stringify(row) + '\n');
      console.log(JSON.stringify(row));
    } finally {
      await s.context.close();
    }
  }
} finally {
  await browser.close();
}
for (const row of rows)
  expect(
    row.textBottom,
    `${row.engine} repeat ${row.repeat}: the last Contents label fits`
  ).toBeLessThanOrEqual(row.viewportHeight);

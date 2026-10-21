import { chromium, webkit, firefox, expect } from '@playwright/test';
import { appendFileSync, mkdirSync } from 'node:fs';
import { localContext, fontsReady, receipt, BASE, EVIDENCE } from './pages-run4.mjs';

const engine = process.env.HUNT_ENGINE ?? 'chromium';
const profiles = {
  phone: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  desktop: { width: 1280, height: 800 },
  narrow: { width: 320, height: 740 },
};
const browser = await { chromium, webkit, firefox }[engine].connect('ws://127.0.0.1:6190/');
mkdirSync(`${EVIDENCE}/beta`, { recursive: true });
try {
  for (const [profile, viewport] of Object.entries(profiles))
    for (const js of [true, false])
      for (const os of ['ios', 'android']) {
        const s = await localContext(browser, { viewport, javaScriptEnabled: js });
        const { page } = s;
        const id = `${engine}-${profile}-js${js ? 'on' : 'off'}-${os}`;
        const row = {
          id,
          engine,
          profile,
          js,
          os,
          at: new Date().toISOString(),
          status: 'PASS',
          details: [],
        };
        try {
          await page.goto(`${BASE}/beta?os=${os}`);
          await fontsReady(page);
          const details = page.locator('details').filter({ visible: true });
          expect(await details.count()).toBeGreaterThan(0);
          for (const detail of await details.all()) {
            const summary = detail.locator('summary');
            const label = await summary.innerText();
            await summary.click();
            await expect(detail).toHaveAttribute('open', '');
            const text = await detail.innerText();
            expect(text.length).toBeGreaterThan(label.length);
            await summary.click();
            await expect(detail).not.toHaveAttribute('open', '');
            await summary.click();
            await expect(detail).toHaveAttribute('open', '');
            row.details.push({ label, text, openedClosedReopened: true });
          }
          row.read = await receipt(page);
          await page.screenshot({ path: `${EVIDENCE}/beta/${id}.png` });
          expect(s.errors).toEqual([]);
          expect(s.external).toEqual([]);
          expect(row.read.csp).toEqual([]);
          row.errors = s.errors;
          row.external = s.external;
        } catch (error) {
          row.status = 'REVIEW';
          row.error = String(error.stack);
        } finally {
          await s.context.close();
          appendFileSync(`${EVIDENCE}/beta-details.jsonl`, JSON.stringify(row) + '\n');
          console.log(
            JSON.stringify({
              id,
              status: row.status,
              details: row.details.length,
              error: row.error?.slice(0, 240),
            })
          );
        }
      }
} finally {
  await browser.close();
}

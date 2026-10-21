import { chromium, webkit, firefox, expect } from '@playwright/test';
import { appendFileSync } from 'node:fs';
import { localContext, fontsReady, receipt, admin, BASE, EVIDENCE } from './pages-run4.mjs';

const engine = process.env.HUNT_ENGINE ?? 'chromium';
const arm = process.env.HUNT_ARM ?? 'rn';
const browser = await { chromium, webkit, firefox }[engine].connect('ws://127.0.0.1:6190/');
try {
  for (let repeat = 1; repeat <= 2; repeat++)
    for (const scheme of ['light', 'dark'])
      for (const js of [true, false]) {
        const s = await localContext(browser, {
          viewport: { width: 320, height: 740 },
          javaScriptEnabled: js,
          colorScheme: scheme,
          reducedMotion: 'reduce',
        });
        const id = `admin-${arm}-${engine}-${scheme}-js${js ? 'on' : 'off'}-${repeat}`;
        const row = {
          id,
          arm,
          engine,
          scheme,
          js,
          repeat,
          at: new Date().toISOString(),
          status: 'OBSERVED',
        };
        try {
          await s.page.goto(`${BASE}/admin`);
          await fontsReady(s.page);
          row.initial = await receipt(s.page);
          row.labels = await s.page.locator('label').evaluateAll((labels) =>
            labels.map((label) => ({
              text: label.textContent,
              for: label.htmlFor,
              targetShown: label.control?.checkVisibility() ?? null,
              shown: label.checkVisibility(),
            }))
          );
          row.fieldNames = await s.page
            .locator('input[type=password]')
            .filter({ visible: true })
            .evaluateAll((nodes) =>
              nodes.map((e) => ({ id: e.id, placeholder: e.placeholder, disabled: e.disabled }))
            );
          row.aria = await s.page.locator('body').ariaSnapshot();
          await s.page.screenshot({ path: `${EVIDENCE}/pages/${id}.png` });
          if (arm === 'rn' && js) row.flow = await admin(s, id);
          expect(s.errors).toEqual([]);
          expect(s.external).toEqual([]);
          row.errors = s.errors;
          row.external = s.external;
          row.consoleErrors = s.consoleErrors;
        } catch (error) {
          row.status = 'REVIEW';
          row.error = String(error.stack);
        } finally {
          await s.context.close();
          appendFileSync(`${EVIDENCE}/admin-review.jsonl`, JSON.stringify(row) + '\n');
          console.log(
            JSON.stringify({
              id,
              status: row.status,
              viewport: row.initial?.viewport,
              overflow: row.initial?.overflow,
              error: row.error,
            })
          );
        }
      }
} finally {
  await browser.close();
}

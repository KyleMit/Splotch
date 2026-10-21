import { writeFileSync, appendFileSync } from 'node:fs';
import { connect, open, boot, button, record, expect, OUT, ENGINE, stroke } from './driver.mjs';

const LIFT_WAIT_MS = 5500;
const MAX_CONTEXTS = 8;
const TARGET_REPRODUCTIONS = 2;
const browser = await connect();
const results = [];
try {
  for (let attempt = 1; attempt <= MAX_CONTEXTS; attempt++) {
    const s = await open(browser, 'desktop');
    try {
      await boot(s);
      await s.page.evaluate(() => {
        window.__haloClock = [];
        document
          .querySelector('[data-testid="drawing-paper"]')
          .addEventListener('pointerup', (event) => {
            window.__haloClock.push({
              phase: 'released',
              time: performance.now(),
              stamp: event.timeStamp,
              trusted: event.isTrusted,
            });
            let count = 0;
            const sample = (raf) => {
              window.__haloClock.push({ phase: 'frame', time: performance.now(), raf });
              if (++count < 6) requestAnimationFrame(sample);
            };
            requestAnimationFrame(sample);
          });
      });
      await record(s, `W05-halo-lift-diagnostic-${attempt}`, async () => {
        await stroke(s, undefined, 'mouse');
        await button(s.page, 'Purple').hover();
        await new Promise((done) => setTimeout(done, LIFT_WAIT_MS));
        const halos = await s.page
          .locator('[data-testid="pointer-halos"]')
          .evaluateAll((nodes) => nodes.map((node) => node.outerHTML));
        const clock = await s.page.evaluate(() => window.__haloClock);
        expect(clock.filter((event) => event.phase === 'released' && event.trusted)).toHaveLength(
          1
        );
        const result = {
          attempt,
          engine: ENGINE,
          waitMs: LIFT_WAIT_MS,
          retainedHalo: halos.length > 0,
          halos,
          clock,
          limits:
            'One trusted mouse stroke, followed by a real hover on a palette control; no Undo, clock override or product-state write.',
        };
        results.push(result);
        writeFileSync(
          `${OUT}/evidence/${ENGINE}-halo-lift-diagnostic.json`,
          JSON.stringify(results, null, 2) + '\n'
        );
        return result;
      });
    } finally {
      await s.ctx.close();
    }
    if (results.filter((result) => result.retainedHalo).length >= TARGET_REPRODUCTIONS) break;
  }
  appendFileSync(
    `${OUT}/status.md`,
    `\n- ${new Date().toISOString()} — ${ENGINE} halo lift diagnostic ended: ${results.filter((result) => result.retainedHalo).length} retained-halo observations in ${results.length} independent contexts; see exact public SVG/clock receipts.\n`
  );
} finally {
  await browser.close();
}

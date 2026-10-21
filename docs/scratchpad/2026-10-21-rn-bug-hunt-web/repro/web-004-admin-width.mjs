import { chromium, webkit, firefox } from '@playwright/test';
import { localContext, fontsReady, receipt, BASE, EVIDENCE } from './pages-run4.mjs';
const engine = process.env.HUNT_ENGINE ?? 'chromium';
const browser = await { chromium, webkit, firefox }[engine].connect('ws://127.0.0.1:6190/');
let reproduced = 0;
try {
  for (let repeat = 1; repeat <= 2; repeat++) {
    const { context, page } = await localContext(browser, {
      viewport: { width: 320, height: 740 },
    });
    try {
      await page.goto(`${BASE}/admin`);
      await fontsReady(page);
      const read = await receipt(page);
      if (read.viewport.scrollWidth > read.viewport.width) reproduced++;
      console.log(JSON.stringify({ repeat, viewport: read.viewport, overflow: read.overflow }));
      await page.screenshot({ path: `${EVIDENCE}/pages/web-004-${engine}-${repeat}.png` });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
process.exitCode = reproduced ? 1 : 0;

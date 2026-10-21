import { chromium, webkit, firefox } from '@playwright/test';
import { localContext, BASE, EVIDENCE } from './pages-run4.mjs';

const engine = process.env.HUNT_ENGINE ?? 'chromium';
const browser = await { chromium, webkit, firefox }[engine].connect('ws://127.0.0.1:6190/');
let reproduced = 0;
try {
  for (let repeat = 1; repeat <= 2; repeat++) {
    const { context, page } = await localContext(browser, {
      javaScriptEnabled: false,
      viewport: { width: 390, height: 844 },
    });
    try {
      await page.goto(`${BASE}/privacy`);
      await page
        .getByRole('link', { name: "What's new", exact: true })
        .filter({ visible: true })
        .click();
      const result = await page.evaluate(() => ({
        url: location.href,
        targetExists: !!document.getElementById(location.hash.slice(1)),
      }));
      await page.screenshot({ path: `${EVIDENCE}/links/web-003-${engine}-${repeat}.png` });
      if (!result.targetExists) reproduced++;
      console.log(
        JSON.stringify({ repeat, ...result, expected: 'A matching visible release target' })
      );
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
process.exitCode = reproduced ? 1 : 0;

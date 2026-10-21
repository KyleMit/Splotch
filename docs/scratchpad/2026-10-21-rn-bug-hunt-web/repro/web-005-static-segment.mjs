import { chromium, webkit, firefox } from '@playwright/test';
import { localContext, fontsReady, BASE, EVIDENCE } from './pages-run4.mjs';
const engine = process.env.HUNT_ENGINE ?? 'chromium';
const browser = await { chromium, webkit, firefox }[engine].connect('ws://127.0.0.1:6190/');
let reproduced = 0;
try {
  for (let repeat = 1; repeat <= 2; repeat++) {
    const { context, page } = await localContext(browser, {
      viewport: { width: 390, height: 844 },
      javaScriptEnabled: false,
      colorScheme: 'light',
    });
    try {
      await page.goto(`${BASE}/design`);
      await fontsReady(page);
      const result = await page
        .getByRole('radiogroup', { name: 'Preview theme', exact: true })
        .evaluate((group) => {
          const selected = group.querySelector('[aria-checked=true]');
          const backing = [...group.querySelectorAll('*')].some(
            (e) =>
              getComputedStyle(e).backgroundColor === 'rgb(124, 80, 187)' &&
              e.getBoundingClientRect().width > 0
          );
          return {
            color: getComputedStyle(selected).color,
            track: getComputedStyle(group).backgroundColor,
            backing,
          };
        });
      if (
        result.color === 'rgb(255, 255, 255)' &&
        result.track === 'rgb(233, 233, 233)' &&
        !result.backing
      )
        reproduced++;
      console.log(JSON.stringify({ repeat, ...result }));
      await page.screenshot({ path: `${EVIDENCE}/segments/web-005-${engine}-${repeat}.png` });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
process.exitCode = reproduced ? 1 : 0;

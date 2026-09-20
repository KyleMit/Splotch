// Read-only diagnostic (never committed as harness): engages the coloring picker the way the
// harness's preparation does, then lists Cache Storage pack markers every 10 s. Changes no product
// or harness code; used to tell "books never install" from "books install under a marker path the
// frozen harness does not read".
import { createRequire } from 'node:module';
const require = createRequire(process.argv[2] + '/');
const { chromium } = require('playwright');
const url = process.argv[3];
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1512, height: 982 } })).newPage();
await page.goto(url, { waitUntil: 'load' });
await page.waitForSelector('#coloringBookButton', { state: 'attached' });
await page.waitForTimeout(2000);
await page.evaluate(() => document.querySelector('#coloringBookButton').click());
await page.waitForFunction(() => document.querySelector('#coloring-book-dialog')?.open === true);
await page.keyboard.press('Escape');
await page.evaluate(() => { const pump = () => requestAnimationFrame(pump); pump(); });
for (let i = 0; i <= 15; i++) {
  const state = await page.evaluate(async () => {
    const out = {};
    for (const name of await caches.keys()) {
      if (!name.startsWith('coloring-packs-')) continue;
      out[name] = (await (await caches.open(name)).keys())
        .map((r) => new URL(r.url).pathname)
        .filter((p) => p.startsWith('/coloring/.installed/'));
    }
    return out;
  });
  const markers = Object.values(state).flat();
  console.log(JSON.stringify({ t: i * 10, caches: Object.keys(state), markerCount: markers.length, markers }));
  if (markers.length >= 7) break;
  await page.waitForTimeout(10000);
}
await browser.close();

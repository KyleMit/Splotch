import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Screenshot the static frame (bundle blocked) and the hydrated, settled screen at one viewport and
// theme; count differing pixels. node pixel-compare.mjs <url> <width>x<height> <light|dark> <out>
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
const require = createRequire(join(REPO, 'package.json'));
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const [url, size, scheme, out] = process.argv.slice(2);
const [width, height] = size.split('x').map(Number);

async function shot(blockBundle) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    colorScheme: scheme,
    isMobile: Math.min(width, height) < 600,
    hasTouch: true,
  });
  const page = await context.newPage();
  if (blockBundle) await page.route('**/_expo/static/js/**', (route) => route.abort());
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(blockBundle ? 500 : 3000);
  const png = await page.screenshot();
  await browser.close();
  return png;
}

const [staticPng, hydratedPng] = [await shot(true), await shot(false)];
writeFileSync(`${out}-static.png`, staticPng);
writeFileSync(`${out}-hydrated.png`, hydratedPng);
const a = PNG.sync.read(staticPng);
const b = PNG.sync.read(hydratedPng);
let differing = 0;
const diff = new PNG({ width: a.width, height: a.height });
for (let i = 0; i < a.data.length; i += 4) {
  const delta = Math.max(
    Math.abs(a.data[i] - b.data[i]),
    Math.abs(a.data[i + 1] - b.data[i + 1]),
    Math.abs(a.data[i + 2] - b.data[i + 2])
  );
  const hit = delta > 2;
  if (hit) differing++;
  diff.data[i] = hit ? 255 : a.data[i] / 3;
  diff.data[i + 1] = hit ? 0 : a.data[i + 1] / 3;
  diff.data[i + 2] = hit ? 0 : a.data[i + 2] / 3;
  diff.data[i + 3] = 255;
}
writeFileSync(`${out}-diff.png`, PNG.sync.write(diff));
console.log(
  JSON.stringify({
    size,
    scheme,
    pixels: a.width * a.height,
    differing,
    share: differing / (a.width * a.height),
  })
);

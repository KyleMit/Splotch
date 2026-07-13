// TEMP (idea-21 experiment): screenshot a contact sheet HTML file. Delete me.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';

const [file, out, clipSpec] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await page.goto(pathToFileURL(file).href);
await page.waitForTimeout(2500);
if (clipSpec) {
  const [x, y, w, h] = clipSpec.split(',').map(Number);
  await page.screenshot({ path: out, clip: { x, y, width: w, height: h } });
} else {
  await page.screenshot({ path: out, fullPage: true });
}
const meta = await page.evaluate(() => ({
  pairs: document.querySelectorAll('.pair').length,
  canvases: document.querySelectorAll('canvas').length,
  drawn: [...document.querySelectorAll('canvas')].filter((c) => c.width > 0).length,
  tags: [...document.querySelectorAll('.tag')].slice(0, 4).map((t) => t.textContent),
  notes: [...document.querySelectorAll('.note')].map((n) => n.textContent).slice(0, 6),
}));
console.log(JSON.stringify({ meta, errors }, null, 2));
await browser.close();

// TEMP (idea-21 experiment): dump tile rects from a rendered sheet. Delete me.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';

const [file] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(pathToFileURL(file).href);
await page.waitForTimeout(2500);
const rects = await page.evaluate(() =>
  [...document.querySelectorAll('figure.half')].map((f) => {
    const r = f.querySelector('canvas').getBoundingClientRect();
    return {
      name: f.querySelector('.name')?.textContent,
      tag: f.querySelector('.tag')?.textContent ?? null,
      theme: f.querySelector('.pill')?.textContent,
      x: r.x + window.scrollX,
      y: r.y + window.scrollY,
      w: r.width,
      h: r.height,
    };
  })
);
console.log(JSON.stringify(rects));
await browser.close();

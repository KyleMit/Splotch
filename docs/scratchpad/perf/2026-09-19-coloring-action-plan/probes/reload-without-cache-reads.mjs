// Control for the observer effect: the same fresh → engage → reload sequence,
// reading Cache Storage only once at the very end, so nothing the probe does
// can have disturbed the context's pack storage before the picker is read.
// Usage: node reload-without-cache-reads.mjs <base-url> <output.json>
import { writeFileSync } from 'node:fs';
import { webkit } from '@playwright/test';

const [base, output] = process.argv.slice(2);
const pickerView = `(() => {
  const dialog = document.querySelector('#coloring-book-dialog');
  return { books: dialog.querySelectorAll('button[aria-label$="coloring book"]').length, pages: dialog.querySelectorAll('button[aria-label$="coloring page"]').length };
})()`;
async function load(page, tag) {
  const url = new URL(base);
  url.searchParams.set('perf-actions', `${Date.now()}-${tag}`);
  await page.goto(url.toString(), { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#drawingCanvas')?.width > 0);
}
async function openPicker(page) {
  await page.evaluate(() => document.querySelector('#coloringBookButton').click());
  await page.waitForFunction(() => document.querySelector('#coloring-book-dialog')?.open === true);
  await page.waitForTimeout(1_100);
  const view = await page.evaluate(pickerView);
  await page.evaluate(() => document.querySelector('#coloring-book-dialog button[aria-label="Close"]').click());
  await page.waitForFunction(() => document.querySelector('#coloring-book-dialog')?.open !== true);
  return view;
}
const browser = await webkit.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1512, height: 982 }, deviceScaleFactor: 2 })).newPage();
const consoleLines = [];
page.on('console', (message) => {
  if (/coloring|pack/i.test(message.text())) consoleLines.push(message.text().slice(0, 300));
});
const record = { base };
await load(page, 'fresh');
record.freshFirstOpen = await openPicker(page);
await page.waitForTimeout(40_000);
record.freshSamePageAfter40s = await openPicker(page);
await load(page, 'reload');
await page.waitForTimeout(25_000);
record.reloadAfter25s = await openPicker(page);
await page.waitForTimeout(40_000);
record.reloadAfter65s = await openPicker(page);
record.cachesAtEnd = await page.evaluate(async () => {
  const out = {};
  for (const name of await caches.keys()) out[name] = (await (await caches.open(name)).keys()).length;
  return out;
});
record.console = consoleLines;
await browser.close();
writeFileSync(output, `${JSON.stringify(record, null, 2)}\n`);
console.log(JSON.stringify(record));

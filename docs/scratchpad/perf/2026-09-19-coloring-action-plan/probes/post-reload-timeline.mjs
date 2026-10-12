// Diagnostic probe: after a fresh context installs at least one book and the
// page reloads, what does the reloaded page's pack storage do over time?
// Usage: node post-reload-timeline.mjs <base-url> <engine> <output.json>
import { writeFileSync } from 'node:fs';
import * as playwright from '@playwright/test';

const [base, engineName, output] = process.argv.slice(2);
const WATCH_MS = 100_000;
const readPackState = `(async () => {
  const names = await caches.keys();
  const markers = [];
  let entries = 0;
  for (const name of names) {
    const keys = await (await caches.open(name)).keys();
    entries += keys.length;
    for (const request of keys) {
      const path = new URL(request.url).pathname;
      if (path.startsWith('/coloring/.installed/')) markers.push(path.split('/').pop());
    }
  }
  const locks = await navigator.locks?.query?.().catch(() => null);
  return { caches: names, entries, markers, heldLocks: locks?.held?.map((l) => l.name) ?? null, pendingLocks: locks?.pending?.map((l) => l.name) ?? null };
})()`;
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
async function watch(page, ms) {
  const timeline = [];
  let last = '';
  const started = Date.now();
  while (Date.now() - started < ms) {
    const state = await page.evaluate(readPackState);
    const signature = JSON.stringify([state.caches, state.markers, state.heldLocks, state.pendingLocks, state.entries > 0]);
    if (signature !== last) {
      timeline.push({ sinceMs: Date.now() - started, ...state });
      last = signature;
    }
    await page.waitForTimeout(500);
  }
  timeline.push({ sinceMs: Date.now() - started, ...(await page.evaluate(readPackState)), final: true });
  return timeline;
}

const browser = await playwright[engineName].launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1512, height: 982 }, deviceScaleFactor: 2 })).newPage();
const consoleLines = [];
page.on('console', (message) => {
  if (/coloring|pack/i.test(message.text())) consoleLines.push(message.text().slice(0, 300));
});
const record = { base, engine: engineName };
await load(page, 'fresh');
record.freshFirstOpen = await openPicker(page);
record.freshTimeline = await watch(page, 40_000);
await load(page, 'reload');
record.reloadTimeline = await watch(page, WATCH_MS);
record.reloadPickerAfterWatch = await openPicker(page);
record.reloadTimelineAfterPickerOpen = await watch(page, 40_000);
record.reloadPickerAtEnd = await openPicker(page);
record.console = consoleLines;
await browser.close();
writeFileSync(output, `${JSON.stringify(record, null, 2)}\n`);

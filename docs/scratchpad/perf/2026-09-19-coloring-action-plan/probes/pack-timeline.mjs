// Diagnostic probe: when does a fresh desktop WebKit context gain coloring
// packs, relative to the picker-open tap, and what does a reload then show?
// Usage: node pack-timeline.mjs <base-url> <output.json>
import { writeFileSync } from 'node:fs';
import { webkit } from '@playwright/test';

const [base, output] = process.argv.slice(2);
const IDLE_BEFORE_ENGAGEMENT_MS = 15_000;
const POLL_MS = 500;
const DOWNLOAD_WATCH_MS = 90_000;

const readPackState = `(async () => {
  const names = (await caches.keys()).filter((name) => name.startsWith('coloring-packs-'));
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
  return { t: Math.round(performance.now()), caches: names, entries, markers };
})()`;

const readPickerView = `(() => {
  const dialog = document.querySelector('#coloring-book-dialog');
  return {
    open: dialog?.open === true,
    bookButtons: dialog?.querySelectorAll('button[aria-label$="coloring book"]').length ?? 0,
    pageButtons: dialog?.querySelectorAll('button[aria-label$="coloring page"]').length ?? 0,
    backButton: dialog?.querySelector('.coloring-back-button') !== null,
  };
})()`;

async function openPicker(page) {
  await page.click('#coloringBookButton');
  await page.waitForFunction(() => document.querySelector('#coloring-book-dialog')?.open === true);
  await page.waitForTimeout(1_100);
  const view = await page.evaluate(readPickerView);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelector('#coloring-book-dialog')?.open !== true);
  return view;
}

async function load(page, tag) {
  const url = new URL(base);
  url.searchParams.set('perf-actions', `${Date.now()}-${tag}`);
  await page.goto(url.toString(), { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#drawingCanvas')?.width > 0);
  // The sweep expands the controls drawer the same way before any measured tap.
  // A scripted click is not a trusted input, so it is not the engagement under test.
  await page.evaluate(() => document.querySelector('button[aria-label="Expand controls"]')?.click());
  await page.waitForSelector('#coloringBookButton', { state: 'visible' });
}

const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1512, height: 982 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
const record = { base, phases: {} };

await load(page, 'fresh');
const idleSamples = [];
for (let waited = 0; waited < IDLE_BEFORE_ENGAGEMENT_MS; waited += POLL_MS * 6) {
  idleSamples.push(await page.evaluate(readPackState));
  await page.waitForTimeout(POLL_MS * 6);
}
record.phases.freshIdleBeforeAnyInput = idleSamples;

record.phases.firstPickerOpen = {
  before: await page.evaluate(readPackState),
  view: await openPicker(page),
};

const timeline = [];
let lastSignature = '';
const started = Date.now();
while (Date.now() - started < DOWNLOAD_WATCH_MS) {
  const state = await page.evaluate(readPackState);
  const signature = `${state.caches.length}|${state.markers.join(',')}`;
  if (signature !== lastSignature) {
    timeline.push({ sinceEngagementMs: Date.now() - started, ...state });
    lastSignature = signature;
  }
  if (timeline.length > 1 && Date.now() - started > 20_000 && state.entries === timeline.at(-1).entries) {
    const settled = await page.evaluate(readPackState);
    await page.waitForTimeout(5_000);
    const later = await page.evaluate(readPackState);
    if (later.entries === settled.entries) break;
  }
  await page.waitForTimeout(POLL_MS);
}
record.phases.afterEngagementTimeline = timeline;
record.phases.samePageReopen = {
  state: await page.evaluate(readPackState),
  view: await openPicker(page),
};

await load(page, 'reload');
await page.waitForTimeout(500);
record.phases.reloadAfterSettle500 = {
  state: await page.evaluate(readPackState),
  view: await openPicker(page),
};
await page.waitForTimeout(5_000);
record.phases.reloadAfter5s = {
  state: await page.evaluate(readPackState),
  view: await openPicker(page),
};

await browser.close();
writeFileSync(output, `${JSON.stringify(record, null, 2)}\n`);
console.log(JSON.stringify(record, null, 2));

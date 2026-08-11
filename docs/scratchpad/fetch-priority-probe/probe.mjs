// Frozen evidence for issue #892 — does a low fetch-priority hint on Splotch's
// speculative coloring traffic change what the network does?
// See ../fetch-priority-prefetch-eval-2026-08.md.
//
//   node docs/scratchpad/fetch-priority-probe/probe.mjs [--build] [--trials=3]
//                                                       [--profile=fast-4g,slow-4g]
//                                                       [--arm=off,img-low,pack-low]
//
// The probe drives the real production bundle rather than a copy: the question
// is about request scheduling across a whole cold first visit (document, JS,
// fonts, coloring-pack downloads, picker art), which no standalone harness
// reproduces. Every arm runs the *same* build, with both hints in `hints.patch`
// applied, and subtracts the ones it does not want through an init script:
//
//   * `off`      — both hints stripped: today's shipped behavior.
//   * `img-low`  — only `imagePrefetch.ts`'s `img.fetchPriority = 'low'`, the
//                  change issue #892 proposes.
//   * `pack-low` — only `webStore.ts`'s `fetch(..., { priority: 'low' })` on
//                  ADR-0103 pack downloads, the alternative the first traces
//                  pointed at.
//   * `both`     — both hints live.
//
// Stripping rather than rebuilding keeps every arm on one set of bytes, so an
// arm cannot differ by a chunk hash or a code-splitting accident. A stripped
// `'low'` becomes `'auto'` (the value the property already had), and the
// selected overlay's `'high'` hint is never touched.
//
// Priorities come from CDP `Network.requestWillBeSent`, which reports the
// priority Chromium assigned the request — the thing the hint is supposed to
// move — alongside the timing needed to see whether it moved anything else.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

import { buildAndPreview } from '../../../tools/perf/preview.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 4188;

// iPad Pro geometry at 2× DPR — ADR-0045's re-entry recipe for the rejected
// page-load strategies, of which the `fetchPriority=low` trial is one.
const VIEWPORT = { width: 1366, height: 934 };
const DEVICE_SCALE_FACTOR = 2;

// The two profiles every prior coloring-prefetch trial used (ADR-0045).
const PROFILES = {
  'fast-4g': { latency: 40, downloadThroughput: (4 * 1024 * 1024) / 8, uploadThroughput: 750_000 },
  'slow-4g': { latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: 400_000 },
};

// A cold constrained load also pulls the ~6.9 MB Workbox precache, so a trial
// that waits for a quiet network waits far longer than the interaction it is
// timing. Each phase gets its own bound instead.
const APP_READY_TIMEOUT_MS = 120_000;
const DIALOG_TIMEOUT_MS = 60_000;
const OVERLAY_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 50;

const STRIP_IMAGE_HINT = () => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'fetchPriority');
  if (!descriptor?.set || !descriptor.get) return;
  Object.defineProperty(HTMLImageElement.prototype, 'fetchPriority', {
    configurable: true,
    enumerable: descriptor.enumerable,
    get() {
      return descriptor.get.call(this);
    },
    set(value) {
      descriptor.set.call(this, value === 'low' ? 'auto' : value);
    },
  });
};

const STRIP_FETCH_HINT = () => {
  const nativeFetch = window.fetch;
  window.fetch = function (input, init) {
    if (init && init.priority === 'low') {
      const { priority: _dropped, ...rest } = init;
      return nativeFetch.call(this, input, rest);
    }
    return nativeFetch.call(this, input, init);
  };
};

// A floor engine (Safari 16.4) has neither hint: `img.fetchPriority = 'low'`
// lands on an ordinary expando and `priority` is an unrecognized RequestInit
// member the fetch ignores. Deleting the accessor reproduces that exactly,
// which is the only way to exercise the fallback on a Chromium that supports
// both. The fetch strip is the same subtraction on the other hint.
const SIMULATE_FLOOR_ENGINE = () => {
  delete HTMLImageElement.prototype.fetchPriority;
};

// The inverse of what #892 proposes, and the arm the first traces argued for:
// the picker's page-overlay warm is the request that actually delivers the
// selected page — `DrawingCanvas`'s high-priority decode reuses it rather than
// issuing its own — so it is the one speculative image that should outrank the
// rest. Scoped by URL here; a shipped version would take the priority at the
// `prefetchImages` call site. Both `srcset` and `src` are covered because the
// responsive assignment starts the request first on web.
const PROMOTE_OVERLAY_PREFETCH = () => {
  for (const property of ['srcset', 'src']) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, property);
    Object.defineProperty(HTMLImageElement.prototype, property, {
      configurable: true,
      enumerable: descriptor.enumerable,
      get() {
        return descriptor.get.call(this);
      },
      set(value) {
        if (!this.isConnected && String(value).includes('.overlay.')) this.fetchPriority = 'high';
        descriptor.set.call(this, value);
      },
    });
  }
};

const ARMS = {
  off: [STRIP_IMAGE_HINT, STRIP_FETCH_HINT],
  'img-low': [STRIP_FETCH_HINT],
  'pack-low': [STRIP_IMAGE_HINT],
  both: [],
  floor: [SIMULATE_FLOOR_ENGINE, STRIP_FETCH_HINT],
  'overlay-high': [STRIP_IMAGE_HINT, STRIP_FETCH_HINT, PROMOTE_OVERLAY_PREFETCH],
  'overlay-high+pack-low': [STRIP_IMAGE_HINT, PROMOTE_OVERLAY_PREFETCH],
};

function parseArgs(argv) {
  const flag = (name, fallback) => {
    const hit = argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
  };
  return {
    build: argv.includes('--build'),
    trials: Number(flag('trials', '3')),
    profiles: flag('profile', 'fast-4g,slow-4g').split(','),
    arms: flag('arm', 'off,img-low,pack-low').split(','),
    // A mouse hover warms every tile the pointer crosses; a tablet tap warms
    // only the page pressed. ADR-0045's re-entry recipe calls the two
    // non-interchangeable, and the tablet is the flagship device.
    input: flag('input', 'click'),
  };
}

async function waitFor(page, predicate, { timeout, label }) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const hit = await page.evaluate(predicate).catch(() => null);
    if (hit) return hit;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await page.waitForTimeout(POLL_INTERVAL_MS);
  }
}

// Both launchers re-arm asynchronously on a slow link, so a click can land
// before its handler is wired. These are toggles, though, so a retry that fires
// while the first click is still opening closes it again: settle on the
// predicate between attempts, and never click when it already holds — the
// semantics of `retryOpen` in the E2E harness.
const OPEN_SETTLE_MS = 2000;

async function activate(page, selector, input) {
  return input === 'tap'
    ? page.tap(selector, { timeout: 2000 })
    : page.click(selector, { timeout: 2000 });
}

async function clickToOpen(page, selector, predicate, { timeout, label, input }) {
  const deadline = Date.now() + timeout;
  let lastError = 'none';
  for (;;) {
    const settled = await waitFor(page, predicate, {
      timeout: OPEN_SETTLE_MS,
      label,
    }).catch(() => null);
    if (settled) return settled;
    if (Date.now() > deadline) throw new Error(`timed out clicking ${label} (${lastError})`);
    await activate(page, selector, input).catch((error) => {
      lastError = error.message.split('\n')[0];
    });
  }
}

function categorize(url) {
  const path = new URL(url).pathname;
  if (path.endsWith('/') || path === '/index.html') return 'document';
  if (path.includes('/coloring/')) {
    if (path.endsWith('.json')) return 'coloring-manifest';
    if (path.includes('.thumb.')) return 'coloring-thumb';
    if (path.includes('.overlay.')) return 'coloring-overlay';
    return 'coloring-fill';
  }
  if (path.endsWith('.js')) return 'script';
  if (path.endsWith('.css')) return 'style';
  if (/\.(woff2?|ttf|otf)$/.test(path)) return 'font';
  if (/\.(png|svg|webp|ico)$/.test(path)) return 'image';
  return 'other';
}

async function runTrial(browser, { arm, profile, index, base, input }) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    hasTouch: true,
  });
  const page = await context.newPage();
  for (const strip of ARMS[arm]) await page.addInitScript(strip);

  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    connectionType: 'cellular4g',
    ...PROFILES[profile],
  });

  const requests = new Map();
  let originSeconds = null;
  const at = (timestamp) => Math.round((timestamp - originSeconds) * 1000);
  cdp.on('Network.requestWillBeSent', (event) => {
    originSeconds ??= event.timestamp;
    requests.set(event.requestId, {
      url: event.request.url,
      category: categorize(event.request.url),
      priority: event.request.initialPriority,
      initiator: event.initiator.type,
      startMs: at(event.timestamp),
      endMs: null,
      bytes: 0,
      fromServiceWorker: false,
    });
  });
  cdp.on('Network.responseReceived', (event) => {
    const record = requests.get(event.requestId);
    if (record) record.fromServiceWorker = event.response.fromServiceWorker ?? false;
  });
  cdp.on('Network.loadingFinished', (event) => {
    const record = requests.get(event.requestId);
    if (!record) return;
    record.endMs = at(event.timestamp);
    record.bytes = event.encodedDataLength;
  });

  const marks = {};
  const wallStart = Date.now();
  await page.goto(base, { waitUntil: 'commit' });
  await waitFor(page, () => document.querySelector('#drawingCanvas') !== null, {
    timeout: APP_READY_TIMEOUT_MS,
    label: 'the drawing canvas',
  });
  marks.canvasMs = Date.now() - wallStart;

  await clickToOpen(
    page,
    'button[aria-label="Expand controls"]',
    () => {
      // A collapsed drawer still lays its buttons out (24 px wide, pointer
      // events off), so presence and a non-empty box both hold while the panel
      // is shut. The expanded state is what a click has to reach.
      const button = document.querySelector('#undoButton');
      return button !== null && getComputedStyle(button).pointerEvents !== 'none';
    },
    { timeout: APP_READY_TIMEOUT_MS, label: 'the actions drawer', input }
  );
  marks.drawerMs = Date.now() - wallStart;

  const dialogStart = Date.now();
  await clickToOpen(
    page,
    '#coloringBookButton',
    () => document.querySelector('#coloring-book-dialog')?.open === true,
    { timeout: DIALOG_TIMEOUT_MS, label: 'the coloring picker', input }
  );
  // A tile with a painted thumbnail is what "the picker is open" means to a
  // child; the dialog element alone can be up with an empty grid.
  await waitFor(
    page,
    () =>
      [...document.querySelectorAll('#coloring-book-dialog img')].some(
        (img) => img.complete && img.naturalWidth > 0
      ),
    { timeout: DIALOG_TIMEOUT_MS, label: 'a painted picker tile' }
  );
  marks.pickerOpenMs = Date.now() - dialogStart;

  const tile = page.locator('#coloring-book-dialog button[aria-label$="coloring page"]').first();
  await tile.waitFor({ state: 'visible', timeout: DIALOG_TIMEOUT_MS });
  const applyStart = Date.now();
  await (input === 'tap' ? tile.tap() : tile.click());
  await waitFor(
    page,
    () => document.querySelector('#coloringOverlay')?.getAttribute('src') ?? null,
    {
      timeout: OVERLAY_TIMEOUT_MS,
      label: 'the ready-gated overlay',
    }
  );
  marks.applyMs = Date.now() - applyStart;

  const trial = { arm, profile, index, input, marks, requests: [...requests.values()] };
  await context.close();
  return trial;
}

// The two request classes the hints target, told apart by initiator: the
// ADR-0103 pack downloader runs `fetch()` from module code, while every
// `imagePrefetch.ts` warm is a detached `Image()` the parser never saw.
const isPackDownload = (record) =>
  record.initiator === 'script' &&
  record.url.includes('/coloring/') &&
  !record.url.endsWith('.json');
const isDetachedPrefetch = (record) =>
  record.initiator === 'other' && record.url.includes('/coloring/');

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function summarize(trials) {
  const priorities = (records) => [...new Set(records.map((record) => record.priority))].join('/');
  const rows = new Map();
  for (const trial of trials) {
    const key = `${trial.profile} ${trial.arm}`;
    const row = rows.get(key) ?? {
      applyMs: [],
      pickerOpenMs: [],
      packPriority: '',
      prefetchPriority: '',
    };
    row.applyMs.push(trial.marks.applyMs);
    row.pickerOpenMs.push(trial.marks.pickerOpenMs);
    row.packPriority = priorities(trial.requests.filter(isPackDownload));
    row.prefetchPriority = priorities(trial.requests.filter(isDetachedPrefetch));
    rows.set(key, row);
  }
  console.log(
    '\nprofile arm | pack prio | prefetch prio | apply median (all) | picker-open median'
  );
  for (const [key, row] of rows) {
    console.log(
      `${key} | ${row.packPriority} | ${row.prefetchPriority} | ` +
        `${median(row.applyMs)} (${row.applyMs.join(', ')}) | ${median(row.pickerOpenMs)}`
    );
  }
}

const options = parseArgs(process.argv.slice(2));
const { base, stop } = await buildAndPreview(PORT, { build: options.build });
const browser = await chromium.launch();
const trials = [];
try {
  for (const profile of options.profiles) {
    for (const arm of options.arms) {
      for (let index = 0; index < options.trials; index++) {
        const trial = await runTrial(browser, { arm, profile, index, base, input: options.input });
        trials.push(trial);
        console.log(
          `${profile} ${arm} #${index}`,
          JSON.stringify(trial.marks),
          `requests=${trial.requests.length}`
        );
      }
    }
  }
} finally {
  await browser.close();
  stop();
}

const outputDir = join(HERE, 'runs');
mkdirSync(outputDir, { recursive: true });
const outputPath = join(outputDir, 'trials.json');
writeFileSync(outputPath, `${JSON.stringify({ options, trials }, null, 2)}\n`);
console.log(`wrote ${outputPath}`);
summarize(trials);

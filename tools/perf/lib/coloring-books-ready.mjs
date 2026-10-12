import { pollUntil } from '../../lib/proc.mjs';

// The web product's own names, which a Node harness cannot import from
// web/src; coloring-books-ready.test.mjs fails if any drifts from its owner.
export const VERSION_JSON_PATH = '/version.json';
export const COLORING_PACK_MANIFEST_PATH_TEMPLATE = '/coloring/manifest-{version}.json';
export const COLORING_PACK_CACHE_FAMILY_PREFIX = 'coloring-packs-';
export const COLORING_PACK_MARKER_PREFIX = '/coloring/.installed/';
// The two product commits around PR 1867 use a versioned v1 cache and marker.
const HISTORICAL_COLORING_PACK_CACHE_PREFIX = 'coloring-packs-v1-';
const HISTORICAL_COLORING_PACK_VERSIONS = ['1.6.269', '1.6.273'];
const COLORING_PACK_FULL_RESOLUTION_MAX_EDGE_PX = 1152;
const COLORING_PACK_COMPACT_SHORT_EDGE_PX = 768;

// A fresh desktop context installed the catalog's seven extra books in about
// 112 s, one every ~16 s (docs/scratchpad/perf/2026-09-19-coloring-action-plan).
// Twice that holds a slower host without letting a stalled download hang a sweep.
const COLORING_BOOKS_INSTALL_TIMEOUT_MS = 240_000;
const INSTALL_POLL_MS = 500;
// The store scan that publishes already-installed books runs at idle after
// boot, so a prepared context lists them a moment after its markers exist.
const COLORING_BOOKS_LISTED_TIMEOUT_MS = 30_000;
const LISTED_POLL_MS = 250;

export const BOOK_CHOICE_SELECTOR = '#coloring-book-dialog button[aria-label$="coloring book"]';
const PICKER_WITNESS_KEY = '__perfColoringPickerOpenWitness';

// A stalled version or manifest response must fail the read, not hang the
// capture: the page aborts its own fetches at the first bound, and the harness
// stops waiting on the transport at the second, which also covers the Cache
// Storage reads no signal can abort.
const INSTALL_STATE_FETCH_TIMEOUT_MS = 15_000;
const INSTALL_STATE_READ_TIMEOUT_MS = 20_000;

// A page expression that evaluates to a Promise, so it needs a transport that
// awaits one: Appium's execute/sync atoms serialize a returned Promise as {}.
// Resolves null where the target keeps no web pack storage to read: a native
// shell installs through its own store, and an engine without Cache Storage
// cannot hold web packs at all.
export const COLORING_BOOK_INSTALL_STATE_EXPRESSION = `(async () => {
  if (typeof caches === 'undefined' || globalThis.Capacitor?.isNativePlatform?.()) return null;
  const abort = new AbortController();
  const fetchDeadline = setTimeout(() => abort.abort(), ${INSTALL_STATE_FETCH_TIMEOUT_MS});
  try {
    const json = async (path) => {
      const response = await fetch(path, { cache: 'no-store', signal: abort.signal });
      if (!response.ok) throw new Error(path + ' answered ' + response.status);
      return response.json();
    };
    const { version } = await json(${JSON.stringify(VERSION_JSON_PATH)});
    const manifest = await json(
      ${JSON.stringify(COLORING_PACK_MANIFEST_PATH_TEMPLATE)}.replace('{version}', version)
    );
    const width = globalThis.screen?.width;
    const height = globalThis.screen?.height;
    const dpr = globalThis.devicePixelRatio;
    const validScreen = [width, height, dpr].every((value) =>
      Number.isFinite(value) && value > 0
    );
    const shortEdge = validScreen ? Math.min(width, height) : 0;
    const longEdge = validScreen ? Math.max(width, height) : 0;
    const paperLongEdge = Math.min(
      longEdge,
      shortEdge * ${COLORING_PACK_FULL_RESOLUTION_MAX_EDGE_PX / COLORING_PACK_COMPACT_SHORT_EDGE_PX}
    );
    const resolution = validScreen && paperLongEdge * dpr <= ${COLORING_PACK_FULL_RESOLUTION_MAX_EDGE_PX}
      ? 'compact' : 'full';
    const historicalLayout = ${JSON.stringify(HISTORICAL_COLORING_PACK_VERSIONS)}.includes(version);
    const expectedCache = historicalLayout
      ? ${JSON.stringify(HISTORICAL_COLORING_PACK_CACHE_PREFIX)} + version + '-' + resolution
      : ${JSON.stringify(COLORING_PACK_CACHE_FAMILY_PREFIX)} + 'v2-' + resolution;
    const expectedMarkers = new Map(manifest.books.map((book) => {
      const variant = book.variants[resolution];
      return [book.id, JSON.stringify({
        id: book.id,
        bytes: variant.bytes,
        files: variant.files.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })),
      })];
    }));
    const marked = new Set();
    for (const name of await caches.keys()) {
      if (name !== expectedCache) continue;
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const path = new URL(request.url).pathname;
        const prefix = historicalLayout
          ? ${JSON.stringify(COLORING_PACK_MARKER_PREFIX)} + version + '/' + resolution + '/'
          : ${JSON.stringify(COLORING_PACK_MARKER_PREFIX)};
        if (!path.startsWith(prefix)) continue;
        const id = path.slice(prefix.length);
        const expected = expectedMarkers.get(id);
        if (!expected) continue;
        const marker = await cache.match(request);
        if (await marker?.text() === expected) marked.add(id);
      }
    }
    const catalog = manifest.books.map((book) => book.id);
    return {
      catalog,
      missing: catalog.filter((id) => id !== manifest.starterBookId && !marked.has(id)),
    };
  } finally {
    clearTimeout(fetchDeadline);
  }
})()`;

// The product installs each pack file after an untimed requestIdleCallback, and
// Chrome on Android grants idle periods from its frame scheduler: on the rig
// phone a waiting page that draws nothing installed one book off the picker's
// own animation frames and then stopped for the whole install bound, while the
// same page completed the catalog in about 20 s once anything requested frames
// (docs/scratchpad/perf/2026-09-19-coloring-first-open). A child's session
// produces frames by drawing; a harness that only waits does not. The pump runs
// in the preparation document alone, which is discarded before any measurement.
const INSTALL_FRAME_PUMP_FLAG = '__coloringInstallFramePump';
export const START_INSTALL_FRAME_PUMP_SCRIPT = `
  window.${INSTALL_FRAME_PUMP_FLAG} = true;
  const pump = () => { if (window.${INSTALL_FRAME_PUMP_FLAG}) requestAnimationFrame(pump); };
  requestAnimationFrame(pump);
  return true;
`;
export const STOP_INSTALL_FRAME_PUMP_SCRIPT = `window.${INSTALL_FRAME_PUMP_FLAG} = false; return true;`;

export function installStateReadTimeoutMessage(timeoutMs) {
  return `Timed out after ${timeoutMs / 1000} s reading which coloring books are installed`;
}

async function readInstallState(executePromise, timeoutMs) {
  let deadline;
  const expired = new Promise((_, reject) => {
    deadline = setTimeout(
      () => reject(new Error(installStateReadTimeoutMessage(timeoutMs))),
      timeoutMs
    );
  });
  try {
    return await Promise.race([executePromise(COLORING_BOOK_INSTALL_STATE_EXPRESSION), expired]);
  } finally {
    clearTimeout(deadline);
  }
}

export function installTimeoutMessage(state, timeoutMs) {
  const extras = state.catalog.length - 1;
  return `Timed out after ${timeoutMs / 1000} s waiting for coloring books to install: ${
    extras - state.missing.length
  } of ${extras} extra books installed, missing ${state.missing.join(', ')}`;
}

export function listedTimeoutMessage(listed, expected, timeoutMs) {
  return `Timed out after ${timeoutMs / 1000} s waiting for the coloring picker to list its installed books: it lists ${listed} book choices, and the served catalog installs ${expected}`;
}

// A web visit downloads its extra books only once the child engages, and the
// picker shows the books known when it opens. So a sweep that opens the picker
// on a context still installing books measures whichever picker that moment
// happens to offer. Settle the installed set first: engage the way the picker's
// opening tap does, wait for every catalog book, then confirm through the
// picker itself that the product lists them all. Returns the listed book count,
// or null where the target has no web pack storage. `execute` runs a synchronous
// script body; `executePromise` evaluates an expression and awaits its Promise.
export async function prepareColoringBooks({
  execute,
  executePromise,
  openPicker,
  closePicker,
  // Test seams: production callers take every bound from the constants.
  installTimeoutMs = COLORING_BOOKS_INSTALL_TIMEOUT_MS,
  listedTimeoutMs = COLORING_BOOKS_LISTED_TIMEOUT_MS,
  readTimeoutMs = INSTALL_STATE_READ_TIMEOUT_MS,
}) {
  let state = await readInstallState(executePromise, readTimeoutMs);
  if (state === null) return null;

  if (state.missing.length > 0) {
    await openPicker();
    await closePicker();
    await execute(START_INSTALL_FRAME_PUMP_SCRIPT);
    let installed;
    try {
      installed = await pollUntil(
        async () => {
          state = await readInstallState(executePromise, readTimeoutMs);
          return state.missing.length === 0;
        },
        installTimeoutMs,
        INSTALL_POLL_MS
      );
    } finally {
      await execute(STOP_INSTALL_FRAME_PUMP_SCRIPT);
    }
    if (!installed) throw new Error(installTimeoutMessage(state, installTimeoutMs));
  }

  // One known book is no choice: the picker drills straight into its pages.
  const expected = state.catalog.length >= 2 ? state.catalog.length : 0;
  let listed = 0;
  const listsEveryBook = await pollUntil(
    async () => {
      await openPicker();
      listed = await listedBookChoices(execute);
      await closePicker();
      return listed === expected;
    },
    listedTimeoutMs,
    LISTED_POLL_MS
  );
  if (!listsEveryBook) throw new Error(listedTimeoutMessage(listed, expected, listedTimeoutMs));
  return listed;
}

export function pickerAlreadyOpenedMessage() {
  return 'The coloring picker has already opened in this document, so its next open is not a first open';
}

export function firstOpenListedMessage(listed, prepared) {
  return `The first coloring picker open listed ${listed} book choices and preparation listed ${prepared}: the installed-book scan had not published them to this document before the measured open`;
}

export function installedBooksLostMessage(state) {
  return state === null
    ? 'The fresh document reports no web pack storage after preparation found some'
    : `The fresh document lost coloring books that preparation installed: missing ${state.missing.join(', ')}`;
}

// The witness records an open even after the dialog closes. It begins after
// app readiness, before preparation or sweep setup. Historical builds
// pre-render tiles, so tile count cannot prove an open.
export const ARM_PICKER_OPEN_WITNESS_SCRIPT = `
  const dialog = document.querySelector('#coloring-book-dialog');
  if (!window.${PICKER_WITNESS_KEY}) {
    const witness = {
      token: String(Date.now()) + ':' + Math.random(),
      opened: dialog?.open === true,
      checked: false,
      dialog,
    };
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) =>
        mutation.type === 'attributes' && mutation.target.id === 'coloring-book-dialog'
      )) witness.opened = true;
      if (!dialog && document.querySelector('#coloring-book-dialog')?.open === true) {
        witness.opened = true;
      }
    });
    if (dialog) {
      observer.observe(dialog, { attributes: true, attributeFilter: ['open'] });
    } else {
      observer.observe(document, {
        attributes: true, attributeFilter: ['open'], childList: true, subtree: true,
      });
    }
    witness.observer = observer;
    window.${PICKER_WITNESS_KEY} = witness;
  }
  return window.${PICKER_WITNESS_KEY}.token;
`;

export async function armPickerOpenWitness(execute) {
  return execute(ARM_PICKER_OPEN_WITNESS_SCRIPT);
}

// The control on the first-open measurement: fails when anything earlier in
// this document, setup included, has opened the picker.
export async function assertPickerNeverOpened(execute) {
  const opened = await execute(`
    const witness = window.${PICKER_WITNESS_KEY};
    if (!witness) throw new Error('The coloring picker open witness was not armed');
    if (witness.checked) return true;
    for (const mutation of witness.observer.takeRecords()) {
      if (mutation.type === 'attributes' && mutation.target.id === 'coloring-book-dialog') {
        witness.opened = true;
      }
    }
    const currentDialog = document.querySelector('#coloring-book-dialog');
    const replaced = witness.dialog && witness.dialog !== currentDialog;
    const opened = witness.opened || currentDialog?.open === true;
    witness.checked = true;
    witness.observer.disconnect();
    if (replaced) throw new Error('The coloring picker dialog changed after its open witness was armed');
    return opened;
  `);
  if (opened) throw new Error(pickerAlreadyOpenedMessage());
}

export async function listedBookChoices(execute) {
  return execute(
    `return document.querySelectorAll(${JSON.stringify(BOOK_CHOICE_SELECTOR)}).length;`
  );
}

// Preparation has to open the picker, and the sweep owes a first open. So the
// books settle in one document and the sweep runs in the next: the installed
// set persists in Cache Storage, and nothing in the sweep's document has
// touched the picker. `loadDocument` navigates to a new document and waits for
// the app; `prepare` is prepareColoringBooks bound to the runner's transports.
// A target without web pack storage never opens the picker to prepare, so its
// first document is already the sweep's.
export async function loadSweepDocumentWithColoringBooks({
  loadDocument,
  prepare,
  execute,
  executePromise,
  // Test seam: production callers take the bound from the constant.
  readTimeoutMs = INSTALL_STATE_READ_TIMEOUT_MS,
}) {
  await loadDocument();
  const preparationDocument = await armPickerOpenWitness(execute);
  const startedAt = Date.now();
  const listedColoringBooks = await prepare();
  if (listedColoringBooks === null) {
    return { listedColoringBooks, preparationMs: null, documentLoads: 1 };
  }
  const preparationMs = Date.now() - startedAt;
  await loadDocument();
  const sweepDocument = await armPickerOpenWitness(execute);
  if (sweepDocument === preparationDocument) {
    throw new Error('Coloring preparation reused the same document as the first-open sweep');
  }
  const state = await readInstallState(executePromise, readTimeoutMs);
  if (state === null || state.missing.length > 0) throw new Error(installedBooksLostMessage(state));
  return { listedColoringBooks, preparationMs, documentLoads: 2 };
}

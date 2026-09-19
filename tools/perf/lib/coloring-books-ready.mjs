import { pollUntil } from '../../lib/proc.mjs';

// The web product's own names, which a Node harness cannot import from
// web/src; coloring-books-ready.test.mjs fails if any drifts from its owner.
export const VERSION_JSON_PATH = '/version.json';
export const COLORING_PACK_MANIFEST_PATH_TEMPLATE = '/coloring/manifest-{version}.json';
export const COLORING_PACK_CACHE_FAMILY_PREFIX = 'coloring-packs-';
export const COLORING_PACK_MARKER_PREFIX = '/coloring/.installed/';

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

// Null where the target keeps no web pack storage to read: a native shell
// installs through its own store, and an engine without Cache Storage cannot
// hold web packs at all.
export const COLORING_BOOK_INSTALL_STATE_SCRIPT = `
  return (async () => {
    if (typeof caches === 'undefined' || globalThis.Capacitor?.isNativePlatform?.()) return null;
    const json = async (path) => {
      const response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) throw new Error(path + ' answered ' + response.status);
      return response.json();
    };
    const { version } = await json(${JSON.stringify(VERSION_JSON_PATH)});
    const manifest = await json(
      ${JSON.stringify(COLORING_PACK_MANIFEST_PATH_TEMPLATE)}.replace('{version}', version)
    );
    const marked = new Set();
    for (const name of await caches.keys()) {
      if (!name.startsWith(${JSON.stringify(COLORING_PACK_CACHE_FAMILY_PREFIX)})) continue;
      for (const request of await (await caches.open(name)).keys()) {
        const path = new URL(request.url).pathname;
        if (path.startsWith(${JSON.stringify(COLORING_PACK_MARKER_PREFIX)})) {
          marked.add(path.slice(${JSON.stringify(COLORING_PACK_MARKER_PREFIX)}.length));
        }
      }
    }
    const catalog = manifest.books.map((book) => book.id);
    return {
      catalog,
      missing: catalog.filter((id) => id !== manifest.starterBookId && !marked.has(id)),
    };
  })();
`;

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
// or null where the target has no web pack storage.
export async function prepareColoringBooks({
  execute,
  openPicker,
  closePicker,
  // Test seams: production callers take both bounds from the constants.
  installTimeoutMs = COLORING_BOOKS_INSTALL_TIMEOUT_MS,
  listedTimeoutMs = COLORING_BOOKS_LISTED_TIMEOUT_MS,
}) {
  let state = await execute(COLORING_BOOK_INSTALL_STATE_SCRIPT);
  if (state === null) return null;

  if (state.missing.length > 0) {
    await openPicker();
    await closePicker();
    const installed = await pollUntil(
      async () => {
        state = await execute(COLORING_BOOK_INSTALL_STATE_SCRIPT);
        return state.missing.length === 0;
      },
      installTimeoutMs,
      INSTALL_POLL_MS
    );
    if (!installed) throw new Error(installTimeoutMessage(state, installTimeoutMs));
  }

  // One known book is no choice: the picker drills straight into its pages.
  const expected = state.catalog.length >= 2 ? state.catalog.length : 0;
  let listed = 0;
  const listsEveryBook = await pollUntil(
    async () => {
      await openPicker();
      listed = await execute(
        `return document.querySelectorAll(${JSON.stringify(BOOK_CHOICE_SELECTOR)}).length;`
      );
      await closePicker();
      return listed === expected;
    },
    listedTimeoutMs,
    LISTED_POLL_MS
  );
  if (!listsEveryBook) throw new Error(listedTimeoutMessage(listed, expected, listedTimeoutMs));
  return listed;
}

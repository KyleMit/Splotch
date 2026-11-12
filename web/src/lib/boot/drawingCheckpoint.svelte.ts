import { untrack } from 'svelte';
import type {
  AppCheckpointHooks,
  ResolvedPage,
  CheckpointPage,
  CheckpointRecord,
  CheckpointStore,
  DrawingCheckpoint,
} from '$lib/drawing/drawingCheckpoint';
import { isCanvasEmpty, restoreDrawing } from '$lib/drawing/engine';
import { captureTiledCheckpoint } from '$lib/drawing/tiledRenderer';
import type { DBSchema } from '$lib/idbDatabase';
import { idbKvStore } from '$lib/idb';
import { isNative } from '$lib/platform';
import { booksForPlatform, STARTER_COLORING_BOOK_ID, type Book } from '$lib/state/books';
import { canvasState } from '$lib/state/canvas.svelte';
import type { ColoringPacksState } from '$lib/state/coloringPacks.svelte';
import { coloringBookState, setOverlayPage } from '$lib/state/coloringBook.svelte';
import { settingsState } from '$lib/state/settings.svelte';

// The drawing checkpoint (ADR-0178), installed from the drawing route's component init. Its module
// loads on demand after mount, restores a picture from an earlier launch, then checkpoints each
// committed change and writes at once when the app leaves the screen. Everything it needs from the
// startup modules is handed to it here (see AppCheckpointHooks).

const DB_NAME = 'splotch-drawing-checkpoint';
const STORE = 'checkpoint';
const CHECKPOINT_KEY = 'current';

interface CheckpointDb extends DBSchema {
  checkpoint: { key: string; value: CheckpointRecord };
}

function createIdbCheckpointStore(): CheckpointStore {
  const store = idbKvStore<CheckpointDb>(DB_NAME, STORE);
  return {
    read: () => store.get(CHECKPOINT_KEY),
    write: (record) => store.put(CHECKPOINT_KEY, record),
    remove: () => store.delete(CHECKPOINT_KEY),
  };
}

function currentPage(): CheckpointPage | null {
  const page = coloringBookState.overlayPage;
  return page ? { id: page.id, orientation: coloringBookState.orientation } : null;
}

// The installed packs are scanned at idle after boot; a checkpoint on a page outside the starter
// book waits this long for the scan before it counts the book as missing.
const PACK_DISCOVERY_WAIT_MS = 10_000;

function packsDiscovered(packs: Pick<ColoringPacksState, 'initialized'>): Promise<boolean> {
  if (packs.initialized) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const settle = (found: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Torn down after the running effect returns, by which time `stop` is assigned.
      queueMicrotask(() => stop());
      resolve(found);
    };
    const timer = setTimeout(() => settle(false), PACK_DISCOVERY_WAIT_MS);
    const stop = $effect.root(() => {
      $effect(() => {
        if (packs.initialized) settle(true);
      });
    });
  });
}

// A page from a book this device does not have, or with the coloring book switched off, cannot
// come back, and its ink without the line art would not be the picture the child left.
async function resolvePage({ id, orientation }: CheckpointPage): Promise<ResolvedPage | null> {
  if (!settingsState.coloringBookEnabled) return null;
  const platform = isNative() ? 'mobile' : 'web';
  const findPage = (books: readonly Book[]) =>
    books.flatMap((book) => book.pages).find((candidate) => candidate.id === id) ?? null;
  const starter = booksForPlatform(platform).filter((book) => book.id === STARTER_COLORING_BOOK_ID);
  let page = findPage(starter);
  if (!page) {
    const { coloringPacksState } = await import('$lib/state/coloringPacks.svelte');
    if (await packsDiscovered(coloringPacksState)) {
      page = findPage(coloringPacksState.availableColoringBooks(platform));
    }
  }
  if (!page) return null;
  const found = page;
  return {
    stillApplies: () => settingsState.coloringBookEnabled,
    apply: () => setOverlayPage(found, orientation),
  };
}

function appCheckpointHooks(): AppCheckpointHooks {
  return {
    store: createIdbCheckpointStore(),
    isCanvasEmpty,
    captureTiles: captureTiledCheckpoint,
    currentPage,
    resolvePage,
    restoreInk: restoreDrawing,
  };
}

export function installDrawingCheckpoint() {
  // Intentionally untracked: set once the on-demand module loads, read only by handlers.
  let checkpoint: DrawingCheckpoint | null = null;

  $effect(() => {
    let disposed = false;
    const flush = () => {
      if (document.visibilityState === 'hidden') void checkpoint?.flush();
    };
    void import('$lib/drawing/drawingCheckpoint')
      .then(({ createAppDrawingCheckpoint }) => {
        if (disposed) return;
        checkpoint = createAppDrawingCheckpoint(appCheckpointHooks());
        void checkpoint.restore();
        checkpoint.changed();
      })
      .catch(() => undefined);
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flush);
      checkpoint?.dispose();
      checkpoint = null;
    };
  });

  // Every committed change the page can show: a stroke group, an undo, a clear, a coloring page.
  $effect(() => {
    void canvasState.strokeCount;
    void canvasState.undoCount;
    void canvasState.canvasEmpty;
    void coloringBookState.overlayPage;
    untrack(() => checkpoint?.changed());
  });
}

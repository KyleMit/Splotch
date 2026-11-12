import { untrack } from 'svelte';
import type {
  AppCheckpointHooks,
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
import { booksForPlatform, STARTER_COLORING_BOOK_ID } from '$lib/state/books';
import { canvasState } from '$lib/state/canvas.svelte';
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

// A page from a book this device no longer has, or with the coloring book switched off, cannot
// come back, and its ink without the line art would not be the picture the child left.
async function restorePage({ id, orientation }: CheckpointPage) {
  if (!settingsState.coloringBookEnabled) return false;
  const platform = isNative() ? 'mobile' : 'web';
  const { coloringPacksState } = await import('$lib/state/coloringPacks.svelte');
  // Until the installed packs are known, only the starter book is sure to be on the device.
  const books = coloringPacksState.initialized
    ? coloringPacksState.availableColoringBooks(platform)
    : booksForPlatform(platform).filter((book) => book.id === STARTER_COLORING_BOOK_ID);
  const page = books.flatMap((book) => book.pages).find((candidate) => candidate.id === id);
  if (!page) return false;
  setOverlayPage(page, orientation);
  return true;
}

function appCheckpointHooks(): AppCheckpointHooks {
  return {
    store: createIdbCheckpointStore(),
    isCanvasEmpty,
    captureTiles: captureTiledCheckpoint,
    currentPage,
    restorePage,
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

// The picture in progress outlives the app's process (ADR-0178). The OS ends a backgrounded app to
// reclaim memory, Android's low-memory killer reaches the WebView renderer first, and a parent can
// swipe the app away; before this, every one of those lost the page (the RN decision campaign's
// durability lane: 30 of 30 tries). The settled page is checkpointed shortly after each change and
// when the app leaves the screen, and an untouched page of the same size gets it back on the next
// launch.
//
// Loaded on demand by lib/boot/drawingCheckpoint.svelte.ts, so none of this joins the startup
// bundle. Everything it needs from startup modules arrives through AppCheckpointHooks, and the
// encoder through exportDrawing.ts's own lazy entry: a static import of a shared module from this
// chunk re-partitions the startup chunks (check-bundle-budgets.mjs pins the native modulepreload
// count).

import type { Orientation } from '$lib/platform';
import type { TiledCanvasSnapshot } from './tiledSurfaces';

// Long enough that a run of strokes is checkpointed once at its end, short enough that a kill soon
// after the child stops loses little.
export const CHECKPOINT_QUIET_MS = 2_000;

export interface CheckpointPage {
  id: string;
  orientation: Orientation;
}

export interface CheckpointRecord {
  // The page's ink as a transparent PNG, stored as bytes rather than a Blob: WKWebView returned a
  // stored Blob after a relaunch that could not be read (unsavedPictureStore.ts).
  bytes: ArrayBuffer;
  cssWidth: number;
  cssHeight: number;
  page: CheckpointPage | null;
}

export interface CheckpointStore {
  read(): Promise<unknown>;
  write(record: CheckpointRecord): Promise<void>;
  remove(): Promise<void>;
}

export type CheckpointCapture =
  // The coloring page is read in the same tick as the tiles, so a page changed while the PNG
  // encodes cannot be stored with the ink drawn on the previous one.
  | { kind: 'ink'; png: Blob; cssWidth: number; cssHeight: number; page: CheckpointPage | null }
  | { kind: 'empty' }
  // A stroke is in progress; its end is a change of its own.
  | { kind: 'busy' };

// A coloring page found on this device. `stillApplies` is asked again in the synchronous restore
// step, since the coloring book can be switched off while the record loads; `apply` runs only once
// the ink it belongs to was accepted.
export interface ResolvedPage {
  stillApplies(): boolean;
  apply(): void;
}

export interface CheckpointDeps {
  store: CheckpointStore;
  capture(): Promise<CheckpointCapture>;
  // Finds the checkpoint's coloring page on this device; null when it is not available here, or
  // once `signal` aborts (the checkpoint was disposed).
  resolvePage(page: CheckpointPage, signal: AbortSignal): Promise<ResolvedPage | null>;
  // Whether nothing has chosen this launch's page yet, so a restore cannot replace it.
  pageUntouched(): boolean;
  // Refuses a page the child has started or paper of another size.
  restoreInk(image: ImageBitmap, cssWidth: number, cssHeight: number): boolean;
  decode(bytes: ArrayBuffer): Promise<ImageBitmap>;
}

export interface DrawingCheckpoint {
  // Resolves whether a checkpointed picture came back. Writes wait for it, so the first empty
  // page of a launch never removes the picture it is about to restore.
  restore(): Promise<boolean>;
  changed(): void;
  flush(): Promise<void>;
  dispose(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const isPositiveInteger = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

function isCheckpointPage(value: unknown): value is CheckpointPage {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    (value.orientation === 'portrait' || value.orientation === 'landscape')
  );
}

// The record can predate a change to its shape, or come from a newer build in another tab.
export function isCheckpointRecord(value: unknown): value is CheckpointRecord {
  return (
    isRecord(value) &&
    value.bytes instanceof ArrayBuffer &&
    value.bytes.byteLength > 0 &&
    isPositiveInteger(value.cssWidth) &&
    isPositiveInteger(value.cssHeight) &&
    (value.page === null || isCheckpointPage(value.page))
  );
}

export function createDrawingCheckpoint(deps: CheckpointDeps): DrawingCheckpoint {
  let restored: Promise<boolean> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let writing: Promise<void> | null = null;
  let rerun = false;
  let disposed = false;
  // Only a launch that has had ink on its page removes the stored picture when the page goes
  // blank. One that never did leaves it for a later launch that can restore it, such as one whose
  // paper is the size the picture was saved at.
  let hadInk = false;
  const disposal = new AbortController();

  async function restoreRecord(): Promise<boolean> {
    const record = await deps.store.read();
    if (!isCheckpointRecord(record)) return false;
    const page = record.page ? await deps.resolvePage(record.page, disposal.signal) : null;
    if (record.page && !page) return false;
    const image = await deps.decode(record.bytes);
    try {
      // One synchronous step after every await: the child can draw or pick a page while the
      // record loads, the coloring book can be switched off, and the drawing route can unmount;
      // nothing may change the page once any of those has happened.
      if (disposed || !deps.pageUntouched() || (page && !page.stillApplies())) return false;
      hadInk = deps.restoreInk(image, record.cssWidth, record.cssHeight);
      if (hadInk) page?.apply();
      return hadInk;
    } finally {
      image.close();
    }
  }

  async function writeOnce() {
    const captured = await deps.capture();
    if (disposed || captured.kind === 'busy') return;
    if (captured.kind === 'empty') {
      if (hadInk) await deps.store.remove();
      return;
    }
    hadInk = true;
    await deps.store.write({
      bytes: await captured.png.arrayBuffer(),
      cssWidth: captured.cssWidth,
      cssHeight: captured.cssHeight,
      page: captured.page,
    });
  }

  // One write at a time; a change during a write runs one more after it.
  function write(): Promise<void> {
    if (writing) {
      rerun = true;
      return writing;
    }
    const run = (async () => {
      await (restored ?? Promise.resolve(false)).catch(() => false);
      do {
        rerun = false;
        // The checkpoint is best effort: a failed capture or store leaves the previous one.
        await writeOnce().catch(() => undefined);
      } while (rerun && !disposed);
    })();
    // No other write starts while this one is pending, so the slot it clears is its own.
    const settled = run.finally(() => {
      writing = null;
    });
    writing = settled;
    return settled;
  }

  function cancelTimer() {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  }

  return {
    restore() {
      restored ??= restoreRecord().catch(() => false);
      return restored;
    },
    changed() {
      if (disposed) return;
      cancelTimer();
      timer = setTimeout(() => {
        timer = null;
        void write();
      }, CHECKPOINT_QUIET_MS);
    },
    flush() {
      if (disposed) return Promise.resolve();
      if (timer === null && !writing) return Promise.resolve();
      cancelTimer();
      return write();
    },
    dispose() {
      disposed = true;
      disposal.abort();
      cancelTimer();
    },
  };
}

export interface TiledCheckpoint {
  snapshot: TiledCanvasSnapshot;
  renderScale: number;
  cssWidth: number;
  cssHeight: number;
}

export interface AppCheckpointHooks {
  store: CheckpointStore;
  isCanvasEmpty(): boolean;
  captureTiles(): TiledCheckpoint | null;
  currentPage(): CheckpointPage | null;
  resolvePage(page: CheckpointPage, signal: AbortSignal): Promise<ResolvedPage | null>;
  restoreInk(image: ImageBitmap, cssWidth: number, cssHeight: number): boolean;
}

export function createAppDrawingCheckpoint(hooks: AppCheckpointHooks): DrawingCheckpoint {
  return createDrawingCheckpoint({
    store: hooks.store,
    async capture() {
      if (hooks.isCanvasEmpty()) return { kind: 'empty' };
      const tiles = hooks.captureTiles();
      if (!tiles) return { kind: 'busy' };
      const page = hooks.currentPage();
      const { snapshot, renderScale, cssWidth, cssHeight } = tiles;
      const { encodeTiledInkPng } = await import('./exportDrawing');
      const png = await encodeTiledInkPng(snapshot, renderScale);
      if (!png) throw new Error('The checkpoint PNG could not be encoded');
      return { kind: 'ink', png, cssWidth, cssHeight, page };
    },
    resolvePage: hooks.resolvePage,
    pageUntouched: () => hooks.currentPage() === null,
    restoreInk: hooks.restoreInk,
    decode: (bytes) => createImageBitmap(new Blob([bytes], { type: 'image/png' })),
  });
}

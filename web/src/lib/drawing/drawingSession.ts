import type { DBSchema } from '$lib/idbDatabase';
import { idbKvStore } from '$lib/idb';
import { scheduleIdle } from '$lib/idle';
import { STORAGE_KEYS, readBool, removeKey, writeBool } from '$lib/storage';
import { PERF_MARKS } from './perf';

// Spike (issue #1450): the ink survives a reload or crash. After the last
// finger lifts and the main thread goes idle, the whole paper's ink is encoded
// as a PNG and kept in IndexedDB (bytes, not a Blob — WKWebView returned a
// stored Blob after relaunch that could not be read, see unsavedPictureStore);
// the next boot within RESTORE_WINDOW_MS stamps it back as history base.

// How long after the last stroke commit the snapshot waits before asking for an
// idle slot: longer than a pause between two scribbles, so a busy child never
// pays the encode mid-session.
export const SNAPSHOT_SETTLE_MS = 2_000;
// A drawing older than this is not "the one they were making": a fresh page.
export const RESTORE_WINDOW_MS = 6 * 60 * 60 * 1000;

const DB_NAME = 'splotch-drawing-session';
const STORE = 'snapshot';
const KEY = 'current';

interface StoredDrawing {
  bytes: ArrayBuffer;
  type: string;
  width: number;
  height: number;
  savedAt: number;
}

interface DrawingSessionDb extends DBSchema {
  snapshot: { key: string; value: StoredDrawing };
}

export interface InkCapture {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  width: number;
  height: number;
}

export interface RestoredInk {
  bitmap: ImageBitmap;
  width: number;
  height: number;
}

interface DrawingSessionHost {
  // null when there is nothing safe to capture (paper unsized, finger down).
  captureInk: () => InkCapture | null;
  isEmpty: () => boolean;
}

export interface DrawingSession {
  // Call after anything that changes the committed ink: stroke commit, undo, clear.
  schedule(): void;
  restore(): Promise<RestoredInk | null>;
  dispose(): void;
}

function canvasToBlob(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob | null> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/png' });
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export function createDrawingSession(host: DrawingSessionHost): DrawingSession {
  const store = idbKvStore<DrawingSessionDb>(DB_NAME, STORE);
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  let cancelIdle: (() => void) | null = null;
  let saving = false;
  let dirtyWhileSaving = false;

  async function forget() {
    removeKey(STORAGE_KEYS.drawingSessionHeld);
    await store.delete(KEY);
  }

  async function save() {
    if (saving) {
      dirtyWhileSaving = true;
      return;
    }
    saving = true;
    try {
      if (host.isEmpty()) {
        await forget();
        return;
      }
      const capture = host.captureInk();
      if (!capture) {
        schedule();
        return;
      }
      if (PERF_MARKS) performance.mark('engine.sessionSnapshot:start');
      const started = performance.now();
      const blob = await canvasToBlob(capture.canvas);
      const encodeMs = performance.now() - started;
      if (!blob) return;
      const bytes = await blob.arrayBuffer();
      await store.put(KEY, {
        bytes,
        type: blob.type,
        width: capture.width,
        height: capture.height,
        savedAt: Date.now(),
      });
      writeBool(STORAGE_KEYS.drawingSessionHeld, true);
      if (PERF_MARKS) performance.measure('engine.sessionSnapshot', 'engine.sessionSnapshot:start');
      if (import.meta.env.DEV) {
        console.info(
          `[drawing-session] saved ${bytes.byteLength} bytes; capture+encode ${encodeMs.toFixed(1)} ms; total ${(performance.now() - started).toFixed(1)} ms; paper ${capture.width}x${capture.height}`
        );
      }
    } catch (err) {
      console.error('Keeping the drawing session failed:', err);
    } finally {
      saving = false;
      if (dirtyWhileSaving) {
        dirtyWhileSaving = false;
        schedule();
      }
    }
  }

  function schedule() {
    if (settleTimer !== null) clearTimeout(settleTimer);
    cancelIdle?.();
    cancelIdle = null;
    settleTimer = setTimeout(() => {
      settleTimer = null;
      cancelIdle = scheduleIdle(() => {
        cancelIdle = null;
        void save();
      });
    }, SNAPSHOT_SETTLE_MS);
  }

  async function restore(): Promise<RestoredInk | null> {
    if (!readBool(STORAGE_KEYS.drawingSessionHeld, false)) return null;
    try {
      const stored = await store.get(KEY);
      if (!stored) return null;
      if (Date.now() - stored.savedAt > RESTORE_WINDOW_MS) {
        await forget();
        return null;
      }
      const bitmap = await createImageBitmap(new Blob([stored.bytes], { type: stored.type }));
      return { bitmap, width: stored.width, height: stored.height };
    } catch (err) {
      console.error('Restoring the drawing session failed:', err);
      return null;
    }
  }

  return {
    schedule,
    restore,
    dispose() {
      if (settleTimer !== null) clearTimeout(settleTimer);
      settleTimer = null;
      cancelIdle?.();
      cancelIdle = null;
    },
  };
}

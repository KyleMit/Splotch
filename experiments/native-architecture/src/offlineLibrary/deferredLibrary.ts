import { isOfflinePageId } from './identity';
import {
  initialLibrarySnapshot,
  LIBRARY_UNAVAILABLE_MESSAGE,
  type LibrarySnapshot,
} from './snapshot';
import type { OfflineLibrary } from './controller';

const UNAVAILABLE_SNAPSHOT: LibrarySnapshot = {
  ...initialLibrarySnapshot,
  status: 'failed',
  fault: 'unavailable',
  message: LIBRARY_UNAVAILABLE_MESSAGE,
};

type Call = (library: OfflineLibrary) => void;

// Stands in for the offline library until its controller loads (runtime.web.ts). Its loading
// snapshot is the controller's own first snapshot. Calls that only set state the controller reads
// later are kept in order and replayed onto it; a call that needs the controller now loads it; the
// launch inventory, which needs the coloring catalog, waits for `idle`. A failed load reports the
// failure the controller reports for a failed catalog, and retry loads afresh.
export function createDeferredLibrary(
  load: () => Promise<OfflineLibrary>,
  idle: () => Promise<void>
): OfflineLibrary {
  let library: OfflineLibrary | null = null;
  let loading: Promise<OfflineLibrary> | null = null;
  let fallback = initialLibrarySnapshot;
  const queued: Call[] = [];
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const start = () => {
    loading ??= load().then(
      (loaded) => {
        library = loaded;
        for (const call of queued.splice(0)) call(loaded);
        loaded.subscribe(notify);
        notify();
        return loaded;
      },
      (error: unknown) => {
        loading = null;
        fallback = UNAVAILABLE_SNAPSHOT;
        notify();
        throw error;
      }
    );
    return loading;
  };
  const settle = (work: Promise<unknown>) => {
    work.catch((error: unknown) => console.error('The offline library failed to load:', error));
  };
  const record = (call: Call) => {
    if (library) call(library);
    else queued.push(call);
  };
  const retry = () => {
    if (!library && fallback !== initialLibrarySnapshot) {
      fallback = initialLibrarySnapshot;
      notify();
    }
    record((owner) => owner.retry());
    settle(start());
  };
  const loaded = () => {
    if (!library) throw new Error('The offline library is not loaded.');
    return library;
  };
  return {
    snapshot: () => library?.snapshot() ?? fallback,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    initialize: async () => {
      if (!library) await idle();
      try {
        await (await start()).initialize();
      } catch (error) {
        console.error('The offline library failed to load:', error);
      }
    },
    setFeatureEnabled: (enabled) => record((owner) => owner.setFeatureEnabled(enabled)),
    setActive: (value) => record((owner) => owner.setActive(value)),
    setDrawing: (value) => record((owner) => owner.setDrawing(value)),
    cancel: () => record((owner) => owner.cancel()),
    engage() {
      record((owner) => owner.engage());
      settle(start());
    },
    // Before the controller loads, the only stalled state is a failed load, which nothing paused.
    retryStalled() {
      if (library) library.retryStalled();
      else if (fallback !== initialLibrarySnapshot) retry();
    },
    retry,
    setPolicy: (enabled, allowMetered) =>
      start().then(
        (owner) => owner.setPolicy(enabled, allowMetered),
        () => undefined
      ),
    remove: (getProtectedPages) =>
      start().then(
        (owner) => owner.remove(getProtectedPages),
        () => undefined
      ),
    async openPage(pageId) {
      if (isOfflinePageId(pageId)) await (await start()).openPage(pageId);
    },
    withSavedArtwork: async (pageId, action) => (await start()).withSavedArtwork(pageId, action),
    cover: (pack, dark) => loaded().cover(pack, dark),
    selector: (pack, page, orientation, dark) => loaded().selector(pack, page, orientation, dark),
  };
}

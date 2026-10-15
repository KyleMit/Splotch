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

export function createDeferredLibrary(
  load: () => Promise<OfflineLibrary>,
  idle: () => Promise<void>,
  resumeAtIdle: () => Promise<boolean>
): OfflineLibrary {
  let library: OfflineLibrary | null = null;
  let loading: Promise<OfflineLibrary> | null = null;
  let initialization: Promise<void> | null = null;
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
    initialize: () => {
      initialization ??= (async () => {
        if (!library) await idle();
        try {
          if (!library && !(await resumeAtIdle())) {
            fallback = { ...initialLibrarySnapshot, status: 'ready', inventoried: true };
            notify();
            return;
          }
          record((owner) => owner.engage());
          await (await start()).initialize();
        } catch (error) {
          console.error('The offline library failed to load:', error);
        }
      })();
      return initialization;
    },
    setFeatureEnabled: (enabled) => record((owner) => owner.setFeatureEnabled(enabled)),
    setActive: (value) => record((owner) => owner.setActive(value)),
    setDrawing: (value) => record((owner) => owner.setDrawing(value)),
    cancel: () => record((owner) => owner.cancel()),
    engage() {
      record((owner) => owner.engage());
      settle(idle().then(start));
    },
    // Before the controller loads, the only stalled state is a failed load, which nothing paused.
    retryStalled() {
      if (library) library.retryStalled();
      else if (fallback.status === 'failed') retry();
    },
    retry,
    setPolicy: (enabled, allowMetered) =>
      start().then(
        (owner) => owner.setPolicy(enabled, allowMetered),
        () => undefined
      ),
    remove: () =>
      start().then(
        (owner) => owner.remove(),
        () => undefined
      ),
    async openPage(pageId) {
      if (isOfflinePageId(pageId)) await (await start()).openPage(pageId);
    },
    cover: (pack, dark) => loaded().cover(pack, dark),
    selector: (pack, page, orientation, dark) => loaded().selector(pack, page, orientation, dark),
  };
}

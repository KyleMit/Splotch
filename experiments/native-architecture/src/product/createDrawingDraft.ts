import { createHistory, type Drawing } from '../drawing/model';
import type { DrawingSession } from './createDrawingSession';
import { decodeDrawingDraft, encodeDrawingDraft, type DrawingDraftStorage } from './drawingDraft';

export type DrawingDraftState = Readonly<{
  status: 'session' | 'loading' | 'ready' | 'saving' | 'failed';
  message: string;
}>;

export function createDrawingDraft(
  session: DrawingSession,
  storage: DrawingDraftStorage,
  prepare: (drawing: Drawing) => Promise<void>
) {
  const initial = session.getSnapshot();
  const listeners = new Set<() => void>();
  let state: DrawingDraftState = { status: 'loading', message: 'Recovering your current picture…' };
  let unsubscribe: (() => void) | null = null;
  let generation = 0;
  let loaded = false;
  let changed = false;
  let restoring = false;
  let pending: Drawing | null = null;
  let writing: Promise<void> | null = null;

  function publish(next: DrawingDraftState) {
    state = next;
    for (const listener of listeners) listener();
  }

  function isCurrent(owner: number) {
    return unsubscribe !== null && owner === generation;
  }

  function flush(): Promise<void> {
    if (writing) return writing;
    const owner = generation;
    writing = (async () => {
      while (pending && loaded && isCurrent(owner)) {
        const drawing = pending;
        pending = null;
        publish({ status: 'saving', message: 'Saving your current picture…' });
        try {
          await storage.write(encodeDrawingDraft(drawing));
        } catch {
          pending ??= drawing;
          if (isCurrent(owner))
            publish({
              status: 'failed',
              message: 'Your current picture could not be saved. Keep this app open and retry.',
            });
          return;
        }
        if (isCurrent(owner) && !pending) publish({ status: 'ready', message: '' });
      }
    })().finally(() => {
      writing = null;
      if (pending && unsubscribe && loaded && state.status !== 'failed') void flush();
    });
    return writing;
  }

  async function load() {
    const owner = generation;
    publish({ status: 'loading', message: 'Recovering your current picture…' });
    try {
      const drawing = decodeDrawingDraft(await storage.read());
      if (!isCurrent(owner)) return;
      if (drawing && !changed && session.getSnapshot() === initial) {
        await prepare(drawing);
        if (!isCurrent(owner)) return;
        if (!changed && session.getSnapshot() === initial) {
          restoring = true;
          try {
            session.setHistory(createHistory(drawing));
          } finally {
            restoring = false;
          }
        }
      }
      loaded = true;
      publish({ status: 'ready', message: '' });
      await flush();
    } catch {
      if (isCurrent(owner))
        publish({
          status: 'failed',
          message:
            'Your current picture could not be recovered. The stored draft has not been changed. Keep this app open and retry.',
        });
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async start() {
      if (unsubscribe) return;
      generation += 1;
      changed ||= session.getSnapshot() !== initial;
      if (changed) pending = session.currentDrawing();
      unsubscribe = session.subscribe(() => {
        if (restoring) return;
        changed = true;
        pending = session.currentDrawing();
        if (loaded) void flush();
      });
      if (loaded) await flush();
      else await load();
    },
    async retry() {
      if (!unsubscribe || state.status === 'loading') return;
      if (!loaded) await load();
      else {
        pending = session.currentDrawing();
        await flush();
      }
    },
    // Leaves a blank page as the stored draft, so a restart comes back to a fresh drawing as
    // shipping's does. A write still in flight lands first, so it cannot overwrite the blank.
    async discard() {
      pending = null;
      await writing;
      await storage.write(encodeDrawingDraft(createHistory().drawing));
    },
    dispose() {
      generation += 1;
      unsubscribe?.();
      unsubscribe = null;
    },
  };
}

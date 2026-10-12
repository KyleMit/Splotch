import { createHistory, type History } from '../drawing/model';
import { coloringBookHistory, DEFAULT_COLORING_BOOK_ENABLED } from '../settings/coloringBook';
import { INITIAL_RAINBOW } from '../drawing/brushes';
import { UNADOPTED_PAPER } from '../drawing/paperSpace';
import { parseRecordedDrawing7 } from '../drawing/recordedDrawing7';
import type { DrawingBackend } from './drawingBackend';

export function createDrawingSession(backend: DrawingBackend = 'legacy') {
  let history = createHistory(
    backend === 'recorded'
      ? parseRecordedDrawing7({
          version: 7,
          paper: UNADOPTED_PAPER,
          pageId: 'blank',
          rainbow: INITIAL_RAINBOW,
          seedCursor: 1,
          commands: [],
        })
      : undefined
  );
  let coloringBookEnabled = DEFAULT_COLORING_BOOK_ENABLED;
  const listeners = new Set<() => void>();

  function setHistory(next: History | ((current: History) => History)) {
    const proposed = typeof next === 'function' ? next(history) : next;
    const value = coloringBookHistory(proposed, coloringBookEnabled);
    if (value === history) return;
    history = value;
    for (const listener of listeners) listener();
  }

  return {
    getSnapshot: () => history,
    currentDrawing: () => history.drawing,
    isColoringBookEnabled: () => coloringBookEnabled,
    setHistory,
    applyColoringBookEnabled(enabled: boolean) {
      coloringBookEnabled = enabled;
      setHistory(history);
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type DrawingSession = ReturnType<typeof createDrawingSession>;

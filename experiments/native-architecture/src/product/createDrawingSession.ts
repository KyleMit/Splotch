import { createHistory, emptyDrawing, type History } from '../drawing/model';
import { pickRainbow } from '../drawing/brushes';
import { coloringBookHistory, DEFAULT_COLORING_BOOK_ENABLED } from '../settings/coloringBook';

export function createDrawingSession() {
  let history = createHistory(emptyDrawing(pickRainbow()));
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

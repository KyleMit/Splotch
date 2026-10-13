import { useUndoShortcut } from '../platform/useUndoShortcut';
import type { useDrawingScreen } from '../useDrawingScreen';

export function useDrawingUndoShortcut(
  screen: ReturnType<typeof useDrawingScreen>,
  blocked: boolean
) {
  useUndoShortcut(
    screen.undo,
    !blocked &&
      !screen.busy &&
      !screen.drawing &&
      !screen.recovery.failed &&
      screen.history.undo.length > 0
  );
}

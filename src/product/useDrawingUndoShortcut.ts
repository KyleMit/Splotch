import { useReduceMotion } from '../drawing/useReduceMotion';
import { useUndoShortcut } from '../platform/useUndoShortcut';
import type { useDrawingScreen } from '../useDrawingScreen';

export function useDrawingUndoShortcut(
  screen: ReturnType<typeof useDrawingScreen>,
  blocked: boolean
) {
  const reduced = useReduceMotion();
  useUndoShortcut(
    () => screen.undo(reduced, null),
    !blocked && !screen.busy && !screen.recovery.failed
  );
}

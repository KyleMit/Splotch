import { useKeyboardCommand } from './KeyboardScope';

export function useUndoShortcut(undo: () => void, enabled: boolean) {
  useKeyboardCommand('undo', enabled, undo);
}

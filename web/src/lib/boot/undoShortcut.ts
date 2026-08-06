import { canvasState } from '$lib/state/canvas.svelte';
import { undo } from '$lib/drawing/engine';

// Ctrl/Cmd+Z works from anywhere on the drawing route, not just while the
// Undo button is visible: the setting only hides the button (see
// actionButtonLayout's data-off-undo), it doesn't disable the underlying
// history, so the keyboard path deliberately bypasses it too. No shake here
// on a no-op — that feedback is panel-local (targets #undoButton), and
// ActionsPanel.svelte's click-path handleUndoClick still plays it.
export function installUndoShortcut(): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (canvasState.canUndo) void undo();
    }
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}

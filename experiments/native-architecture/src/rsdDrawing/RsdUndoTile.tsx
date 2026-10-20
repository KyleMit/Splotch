import type { useDrawingScreen } from '../useDrawingScreen';
import type { DrawerTool } from './RsdDrawerTools';
import { RsdIconButton } from './RsdIconButton';

// The drawer's Undo tile. At the end of history it stays pressable, as shipping's aria-disabled
// button does, so the press can answer with the unavailable cue.
export function RsdUndoTile({
  face,
  screen,
  disabled,
  reduced,
}: {
  face: Parameters<DrawerTool['render']>[0];
  screen: ReturnType<typeof useDrawingScreen>;
  disabled: boolean;
  reduced: boolean;
}) {
  return (
    <RsdIconButton
      skin="tile"
      {...face}
      icon="undo"
      label="Undo"
      disabled={disabled}
      unavailable={screen.history.undo.length === 0}
      undoFeedback={screen.undoFeedback}
      unavailableFeedback={screen.unavailableFeedback}
      onPress={() => screen.undoFromButton(reduced)}
    />
  );
}

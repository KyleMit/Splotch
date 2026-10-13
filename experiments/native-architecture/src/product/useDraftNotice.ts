import { useState } from 'react';
import type { useDrawingScreen } from '../useDrawingScreen';

export function useDraftNotice(screen: ReturnType<typeof useDrawingScreen>, blocked: boolean) {
  const state = screen.draftState;
  const [settled, setSettled] = useState(state);
  // Status layout stays fixed while contacts own the paper frame.
  if (!screen.drawing && settled !== state) setSettled(state);
  return {
    state: screen.drawing ? settled : state,
    disabled: blocked || screen.disabled || screen.drawing,
    retry: () => {
      void screen.retryDraft();
    },
  };
}

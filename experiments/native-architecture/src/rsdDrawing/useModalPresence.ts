import { useCallback, useState } from 'react';

// Keeps the last value a dialog was opened with until its exit has played, so a caller whose state
// clears on close still renders the card that is leaving.
export function useModalPresence<Value>(current: Value | null) {
  const [shown, setShown] = useState(current);
  if (current !== null && current !== shown) setShown(current);
  const dismissed = useCallback(() => setShown(null), []);
  return { shown: current ?? shown, visible: current !== null, dismissed };
}

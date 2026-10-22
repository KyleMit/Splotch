import { useMemo, useState } from 'react';
import type { ParentGateState } from './parentGate';

export type ParentGateView = Readonly<{
  /** The card is on screen: a challenge is open, or a solved one is holding its "Unlocked!". */
  open: boolean;
  unlocked: boolean;
  /** The card as it last stood open, kept through its exit so the leaving card keeps its face. */
  state: ParentGateState;
}>;

// The gate holds its own success and hands over once the card has gone, so the screen only keeps
// the face the card last showed while it plays its exit.
export function useParentGateCard(state: ParentGateState | null): ParentGateView | null {
  const [last, setLast] = useState(state);
  if (state?.open && state !== last) setLast(state);
  const open = state?.open === true;
  const shown = open ? state : last;
  return useMemo(
    () => (shown ? { open, unlocked: shown.unlocked, state: shown } : null),
    [open, shown]
  );
}

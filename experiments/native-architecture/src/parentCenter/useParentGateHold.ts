import { useEffect, useMemo, useState } from 'react';
import { PARENT_GATE_SUCCESS_HOLD_MS, type ParentGateState } from './parentGate';

export type ParentGateView = Readonly<{
  /** The card is on screen: a challenge is open, or a solved one is holding its success. */
  open: boolean;
  unlocked: boolean;
  /** The challenge the card shows, kept from its last open moment through the success hold. */
  state: ParentGateState;
}>;

// The shipping card shows "Unlocked!" for a beat before its destination opens. The gate grants the
// operation the moment it is solved, so the hold is the screen's: the card stays in front of
// whatever the answer opened until the hold ends, and a new challenge takes the card at once.
export function useParentGateHold(state: ParentGateState | null): ParentGateView | null {
  const solves = state?.solves ?? 0;
  const [seenSolves, setSeenSolves] = useState(solves);
  const [holding, setHolding] = useState(false);
  const [last, setLast] = useState(state);
  if (solves !== seenSolves) {
    setSeenSolves(solves);
    setHolding(true);
  }
  if (state?.open && holding) setHolding(false);
  if (state?.open && state !== last) setLast(state);
  useEffect(() => {
    if (!holding) return;
    const timer = setTimeout(() => setHolding(false), PARENT_GATE_SUCCESS_HOLD_MS);
    return () => clearTimeout(timer);
  }, [holding, seenSolves]);
  const open = state?.open === true;
  const shown = open ? state : last;
  // One object per change, so a caller holding the card through its exit sees a stable value.
  return useMemo(
    () => (shown ? { open: open || holding, unlocked: holding && !open, state: shown } : null),
    [open, holding, shown]
  );
}

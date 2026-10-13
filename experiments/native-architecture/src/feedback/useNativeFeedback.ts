import { useEffect, useSyncExternalStore } from 'react';
import type { NativeFeedbackOwner, NativeFeedbackState } from './feedback';

const FEEDBACK_GATE_TICK_MS = 1000;
const noFeedbackState = () => null;
const noFeedbackSubscription = () => () => {};

export function useNativeFeedbackState(
  owner: NativeFeedbackOwner | null
): NativeFeedbackState | null {
  const state = useSyncExternalStore(
    owner?.subscribe ?? noFeedbackSubscription,
    owner?.getState ?? noFeedbackState,
    owner?.getState ?? noFeedbackState
  );
  useEffect(() => {
    if (!owner || state?.sharedParent || !state?.gate.open) return;
    const timer = setInterval(owner.gateTick, FEEDBACK_GATE_TICK_MS);
    return () => clearInterval(timer);
  }, [owner, state?.gate.open, state?.sharedParent]);
  useEffect(() => {
    if (!owner || state?.sharedParent || state?.delivery.status !== 'throttled') return;
    const timer = setInterval(owner.deliveryTick, FEEDBACK_GATE_TICK_MS);
    return () => clearInterval(timer);
  }, [owner, state?.delivery.status, state?.sharedParent]);
  return state;
}

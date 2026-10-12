import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  createNativeFeedback,
  type NativeFeedbackOwner,
  type NativeFeedbackState,
} from './feedback';
import {
  feedbackDevice,
  feedbackOffline,
  feedbackPolicyStorage,
  feedbackTransport,
} from '../platform/feedback';

const FEEDBACK_GATE_TICK_MS = 1000;
const noFeedbackState = () => null;
const noFeedbackSubscription = () => () => {};

export function useNativeFeedback() {
  const [owner, setOwner] = useState<NativeFeedbackOwner | null>(null);
  useEffect(() => {
    const instance = createNativeFeedback({
      transport: feedbackTransport,
      device: feedbackDevice,
      offline: feedbackOffline,
      policyStorage: feedbackPolicyStorage,
    });
    setOwner(instance);
    void instance.loadPolicy();
    return () => {
      instance.dispose();
    };
  }, []);
  return { owner };
}

export function useNativeFeedbackState(
  owner: NativeFeedbackOwner | null
): NativeFeedbackState | null {
  const state = useSyncExternalStore(
    owner?.subscribe ?? noFeedbackSubscription,
    owner?.getState ?? noFeedbackState,
    owner?.getState ?? noFeedbackState
  );
  useEffect(() => {
    if (!owner || !state?.gate.open) return;
    const timer = setInterval(owner.gateTick, FEEDBACK_GATE_TICK_MS);
    return () => clearInterval(timer);
  }, [owner, state?.gate.open]);
  useEffect(() => {
    if (!owner || state?.delivery.status !== 'throttled') return;
    const timer = setInterval(owner.deliveryTick, FEEDBACK_GATE_TICK_MS);
    return () => clearInterval(timer);
  }, [owner, state?.delivery.status]);
  return state;
}

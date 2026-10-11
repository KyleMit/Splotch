import { useEffect, useState } from 'react';
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

export function useNativeFeedback() {
  const [owner, setOwner] = useState<NativeFeedbackOwner | null>(null);
  const [state, setState] = useState<NativeFeedbackState | null>(null);
  useEffect(() => {
    const instance = createNativeFeedback({
      transport: feedbackTransport,
      device: feedbackDevice,
      offline: feedbackOffline,
      policyStorage: feedbackPolicyStorage,
    });
    setOwner(instance);
    setState(instance.getState());
    const unsubscribe = instance.subscribe(() => setState(instance.getState()));
    void instance.loadPolicy();
    return () => {
      unsubscribe();
      instance.dispose();
    };
  }, []);
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
  return { owner, state };
}

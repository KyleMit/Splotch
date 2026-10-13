import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo } from 'react-native';
import { observeReduceMotion } from './reduceMotion';
import {
  REDUCE_MOTION_DEFAULT,
  resolveReducedMotion,
  type ReduceMotionPreference,
} from '../settings/reduceMotion';

const ReduceMotionPreferenceContext = createContext<ReduceMotionPreference>(REDUCE_MOTION_DEFAULT);
// One device observation for the screen: a dialog that mounts as it opens would otherwise start
// from the observer's cautious first answer and fade instead of flying in.
const DeviceReduceMotionContext = createContext<boolean | null>(null);

function useObservedReduceMotion(observe: boolean) {
  const [reduced, setReduced] = useState(true);
  useEffect(
    () => (observe ? observeReduceMotion(AccessibilityInfo, setReduced) : undefined),
    [observe]
  );
  return reduced;
}

// The parent's Reduce Motion choice from Settings, which overrides the device's own setting
// the way the shipping app's stored preference overrides prefers-reduced-motion.
export function ReduceMotionPreferenceProvider({
  preference,
  children,
}: {
  preference: ReduceMotionPreference;
  children: ReactNode;
}) {
  const device = useObservedReduceMotion(true);
  return createElement(
    ReduceMotionPreferenceContext.Provider,
    { value: preference },
    createElement(DeviceReduceMotionContext.Provider, { value: device }, children)
  );
}

export function useDeviceReduceMotion() {
  const shared = useContext(DeviceReduceMotionContext);
  const own = useObservedReduceMotion(shared === null);
  return shared ?? own;
}

export function useReduceMotion() {
  const preference = useContext(ReduceMotionPreferenceContext);
  return resolveReducedMotion(preference, useDeviceReduceMotion());
}

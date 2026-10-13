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

// The parent's Reduce Motion choice from Settings, which overrides the device's own setting
// the way the shipping app's stored preference overrides prefers-reduced-motion.
export function ReduceMotionPreferenceProvider({
  preference,
  children,
}: {
  preference: ReduceMotionPreference;
  children: ReactNode;
}) {
  return createElement(ReduceMotionPreferenceContext.Provider, { value: preference }, children);
}

export function useDeviceReduceMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => observeReduceMotion(AccessibilityInfo, setReduced), []);
  return reduced;
}

export function useReduceMotion() {
  const preference = useContext(ReduceMotionPreferenceContext);
  return resolveReducedMotion(preference, useDeviceReduceMotion());
}

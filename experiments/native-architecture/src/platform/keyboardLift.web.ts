import { useRef } from 'react';
import { Animated } from './animated';

// A browser keeps a focused field in view itself, so the web card never lifts.
export function useKeyboardLift(_active: boolean) {
  return useRef(new Animated.Value(0)).current;
}

import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { observeReduceMotion } from './reduceMotion';

export function useReduceMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => observeReduceMotion(AccessibilityInfo, setReduced), []);
  return reduced;
}

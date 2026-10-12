import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { observeReduceMotion } from './reduceMotion';

export function useModalAnimation(): 'none' | 'fade' {
  const [reduced, setReduced] = useState(true);
  useEffect(() => observeReduceMotion(AccessibilityInfo, setReduced), []);
  return reduced ? 'none' : 'fade';
}

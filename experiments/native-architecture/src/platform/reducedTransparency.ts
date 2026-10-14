import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// Whether the reader turned on iOS Reduce Transparency, which shipping's
// prefers-reduced-transparency rules answer with solid surfaces. Android has no such setting.
export function useReducedTransparency() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let current = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then((enabled) => {
      if (current) setReduced(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      setReduced
    );
    return () => {
      current = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}

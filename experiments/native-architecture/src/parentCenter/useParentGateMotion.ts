import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { useReduceMotion } from '../drawing/useReduceMotion';
import { PARENT_GATE_SHAKE_MS, type ParentGateState } from './parentGate';

const SHAKE_OFFSET_PX = 8;
const SHAKE_STEPS = 4;
export function useParentGateMotion(state: ParentGateState) {
  const reduced = useReduceMotion();
  const offset = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!state.shaking || reduced) return;
    const animation = Animated.sequence(
      [SHAKE_OFFSET_PX, -SHAKE_OFFSET_PX, SHAKE_OFFSET_PX, 0].map((toValue) =>
        Animated.timing(offset, {
          toValue,
          duration: PARENT_GATE_SHAKE_MS / SHAKE_STEPS,
          useNativeDriver: true,
        })
      )
    );
    animation.start();
    return () => {
      animation.stop();
      offset.setValue(0);
    };
  }, [offset, reduced, state.announcementId, state.shaking]);
  return offset;
}

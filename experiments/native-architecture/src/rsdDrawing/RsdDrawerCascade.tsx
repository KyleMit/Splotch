import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing } from '../platform/animated';
import { useReduceMotion } from '../drawing/useReduceMotion';
import { DRAWING_SCALE, DRAWING_EASE_POP } from '../drawing/theme';

const DRAWER_CASCADE_DELAY_MS = 30;
const DRAWER_CASCADE_FROM_X_PX = -18;
const DRAWER_CASCADE_FROM_SCALE = 0.6;

const MS_PER_SECOND = 1000;
const DURATION_MS = DRAWING_SCALE.durationBase * MS_PER_SECOND;
const POP = Easing.bezier(...DRAWING_EASE_POP);

export function RsdDrawerCascade({
  opening,
  index,
  onEntered,
  children,
}: {
  opening: boolean;
  index: number;
  onEntered?: () => void;
  children: ReactNode;
}) {
  const reduced = useReduceMotion();
  const progress = useRef(new Animated.Value(opening && !reduced ? 0 : 1)).current;
  useEffect(() => {
    if (!opening || reduced) {
      progress.setValue(1);
      onEntered?.();
      return;
    }
    progress.setValue(0);
    const cascade = Animated.timing(progress, {
      toValue: 1,
      duration: DURATION_MS,
      delay: index * DRAWER_CASCADE_DELAY_MS,
      easing: POP,
      useNativeDriver: true,
    });
    cascade.start(({ finished }) => {
      if (finished) onEntered?.();
    });
    return () => cascade.stop();
  }, [opening, reduced, index, onEntered, progress]);
  const from = (value: number) =>
    progress.interpolate({ inputRange: [0, 1], outputRange: [value, 0] });
  return (
    <Animated.View
      testID="rsd-drawer-cascade"
      style={{
        opacity: progress,
        transform: [
          { translateX: from(DRAWER_CASCADE_FROM_X_PX) },
          {
            scale: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [DRAWER_CASCADE_FROM_SCALE, 1],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

export function useDrawerOpening(chosenOpen: boolean, drawing: boolean) {
  const [lastOpen, setLastOpen] = useState(chosenOpen);
  const [opening, setOpening] = useState(false);
  if (lastOpen !== chosenOpen) {
    setLastOpen(chosenOpen);
    setOpening(chosenOpen && !drawing);
  }
  const finish = useCallback(() => setOpening(false), []);
  return { opening: opening && !drawing, finish };
}

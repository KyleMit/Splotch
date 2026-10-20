import { useEffect, useRef, type ReactNode } from 'react';
import { Animated } from '../platform/animated';
import type { UnavailableFeedback } from '../drawing/undoFeedback';
import { useUnavailableMotion } from './unavailableMotionSurface';

// The whole tile answers a press it cannot act on, as shipping's .action-unavailable does: the
// tile shakes and flashes (unavailableMotion.tsx). This wrapper is the tile's parent from its first
// render, so the motion arriving later on web adds to it without remounting the tile, whose
// focus a keyboard user would otherwise lose.
export function RsdUnavailableCue({
  feedback,
  size,
  radius,
  borderPx,
  lit,
  children,
}: {
  feedback: UnavailableFeedback | null;
  size: number;
  radius: number;
  borderPx: number;
  lit: ReactNode;
  children: ReactNode;
}) {
  const motion = useUnavailableMotion();
  const shake = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const timeline = motion?.shakeTimeline(shake, feedback);
    timeline?.start();
    return () => timeline?.stop();
  }, [motion, feedback, shake]);
  return (
    <Animated.View
      testID="rsd-unavailable-cue"
      style={motion ? { transform: motion.shakeTransform(shake) } : undefined}
    >
      {children}
      {motion ? (
        <motion.UnavailableFlash
          feedback={feedback}
          size={size}
          radius={radius}
          borderPx={borderPx}
          lit={lit}
        />
      ) : null}
    </Animated.View>
  );
}

import { useEffect, useRef, type ReactNode } from 'react';
import { Animated } from '../platform/animated';
import type { UndoFeedback } from '../drawing/undoFeedback';
import { keyframeTimeline, keyframeValue } from './keyframeMotion';
import { UNDO_SPIN_MS, UNDO_SPIN_KEYFRAMES } from './undoKeyframes';

export function RsdUndoFeedback({
  feedback,
  children,
}: {
  feedback: UndoFeedback | null;
  children: ReactNode;
}) {
  const progress = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const elapsedMs = feedback ? performance.now() - feedback.startedAt : UNDO_SPIN_MS;
    if (!feedback || feedback.reduced || elapsedMs >= UNDO_SPIN_MS) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const spin = keyframeTimeline(progress, UNDO_SPIN_KEYFRAMES, UNDO_SPIN_MS, 0, elapsedMs);
    spin.start();
    return () => spin.stop();
  }, [feedback, progress]);
  const rotate = keyframeValue(progress, UNDO_SPIN_KEYFRAMES, (frame) => frame.rotate).interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '1deg'],
  });
  return (
    <Animated.View testID="rsd-undo-feedback" style={{ transform: [{ rotate }] }}>
      {children}
    </Animated.View>
  );
}

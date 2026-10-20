import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated } from '../platform/animated';
import { keyframeTimeline } from '../rsdDrawing/keyframeMotion';
import { useReduceMotion } from './useReduceMotion';
import type { PaperFrame } from './paperGeometry';
import type { UndoGhost } from './undoFeedback';
import {
  UNDO_GHOST_MS,
  UNDO_GHOST_SCALE,
  UNDO_GHOST_DRIFT_FRACTION,
  UNDO_GHOST_EASE,
  type GhostBounds,
} from './undoGhostGeometry';

const GHOST_TIMELINE = [
  { at: 0, easing: UNDO_GHOST_EASE },
  { at: 1, easing: [0, 0, 1, 1] },
] as const;

export function UndoInkMotion({
  feedback,
  bounds,
  frame,
  children,
}: {
  feedback: UndoGhost;
  bounds: GhostBounds;
  frame: PaperFrame | null;
  children: ReactNode;
}) {
  const reduced = useReduceMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const [finished, setFinished] = useState(false);
  const lifecycle = useRef({ generation: 0 });
  useEffect(() => {
    const lifetime = lifecycle.current;
    const generation = ++lifetime.generation;
    let cancelled = false;
    let secondFrame = 0;
    let reported = false;
    const reportFinished = () => {
      if (!reported) {
        reported = true;
        feedback.onFinished();
      }
    };
    if (reduced) {
      reportFinished();
      return;
    }
    let motion: ReturnType<typeof Animated.timing> | undefined;
    // Shipping's runWhenPainted (inkMotion.ts): the fly-away starts one frame after the frame that
    // paints the ghost, never at the press. Timed from the press, the render and the ghost's build
    // used up most of the eased fade before any of it reached the screen (#3073).
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        motion = keyframeTimeline(progress, GHOST_TIMELINE, UNDO_GHOST_MS);
        motion.start(({ finished: completed }) => {
          if (completed && !cancelled) {
            setFinished(true);
            reportFinished();
          }
        });
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      motion?.stop();
      // StrictMode renews setup after cleanup; only an unreplaced cleanup ends the cue.
      queueMicrotask(() => {
        if (lifetime.generation === generation) reportFinished();
      });
    };
  }, [feedback, progress, reduced]);
  if (finished || feedback.reduced || reduced) return null;
  const target = feedback.towards;
  const dx =
    target && frame
      ? (target.x - frame.pageX - bounds.left - bounds.width / 2) * UNDO_GHOST_DRIFT_FRACTION
      : 0;
  const dy =
    target && frame
      ? (target.y - frame.pageY - bounds.top - bounds.height / 2) * UNDO_GHOST_DRIFT_FRACTION
      : 0;
  return (
    <Animated.View
      testID="undo-ink-motion"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: 'absolute',
        ...bounds,
        opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        transform: [
          { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
          {
            scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, UNDO_GHOST_SCALE] }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

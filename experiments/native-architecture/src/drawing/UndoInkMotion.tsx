import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing } from '../platform/animated';
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
  const elapsedMs = Math.max(0, performance.now() - feedback.startedAt);
  const expired = elapsedMs >= UNDO_GHOST_MS;
  const progress = useRef(
    new Animated.Value(Easing.bezier(...UNDO_GHOST_EASE)(Math.min(1, elapsedMs / UNDO_GHOST_MS)))
  ).current;
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
    if (reduced || expired) {
      reportFinished();
      return;
    }
    let motion: ReturnType<typeof Animated.timing> | undefined;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const elapsed = Math.max(0, performance.now() - feedback.startedAt);
        if (elapsed >= UNDO_GHOST_MS) {
          setFinished(true);
          reportFinished();
          return;
        }
        motion = keyframeTimeline(progress, GHOST_TIMELINE, UNDO_GHOST_MS, 0, elapsed);
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
  }, [feedback, progress, reduced, expired]);
  if (finished || feedback.reduced || reduced || expired) return null;
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

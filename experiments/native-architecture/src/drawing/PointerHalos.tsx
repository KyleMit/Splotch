import { memo, useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { Canvas, Picture, Skia } from '@shopify/react-native-skia';
import {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { haloMotionEnd, reconcileHalos, type ShownHalo } from './haloModel';
import type { HaloFeed } from './haloFeed';
import { paintHalos } from './skiaHaloPainter';
import { useReduceMotion } from './useReduceMotion';

type HaloTrack = { shown: readonly ShownHalo[]; settlesAt: number };

// The clock counts the JS thread's performance.now(), which stamps each halo, and runs on the UI
// thread only until the last grow-in or lift-off ends. Reduced motion is the halo model's own
// answer, so Reanimated's system-setting shortcut must not cut the clock short.
function runClock(clock: SharedValue<number>, now: number, end: number, running: boolean) {
  if (!running) clock.value = now;
  clock.value = withTiming(end, {
    duration: end - now,
    easing: Easing.linear,
    reduceMotion: ReduceMotion.Never,
  });
}

function useHaloPicture(feed: HaloFeed) {
  const reduced = useReduceMotion();
  const shown = useSharedValue<readonly ShownHalo[]>([]);
  const clock = useSharedValue(0);
  const reducedMotion = useSharedValue(reduced);
  const track = useRef<HaloTrack>({ shown: [], settlesAt: -Infinity }).current;
  useEffect(() => {
    reducedMotion.value = reduced;
    const update = () => {
      const now = performance.now();
      track.shown = reconcileHalos(track.shown, feed.current(), now, reduced);
      shown.value = track.shown;
      const end = reduced ? -Infinity : haloMotionEnd(track.shown);
      if (end <= track.settlesAt) return;
      runClock(clock, now, end, track.settlesAt > now);
      track.settlesAt = end;
    };
    update();
    const unsubscribe = feed.subscribe(update);
    return () => {
      unsubscribe();
      cancelAnimation(clock);
      track.settlesAt = -Infinity;
    };
  }, [feed, reduced, track, shown, clock, reducedMotion]);
  return useDerivedValue(() => {
    const recorder = Skia.PictureRecorder();
    paintHalos(recorder.beginRecording(), shown.value, clock.value, reducedMotion.value);
    return recorder.finishRecordingAsPicture();
  });
}

// Halos follow contacts through shared values and animate on the UI thread, so neither a moving
// finger nor a grow-in or lift-off renders React. A sibling canvas keeps those frames from
// replaying the ink beneath.
export const PointerHalos = memo(function PointerHalos({ feed }: { feed: HaloFeed }) {
  const picture = useHaloPicture(feed);
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none" testID="pointer-halos">
      <Picture picture={picture} />
    </Canvas>
  );
});

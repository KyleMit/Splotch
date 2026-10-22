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

type HaloTrack = { shown: readonly ShownHalo[]; settlesAt: number; held: boolean };

// How far ahead a contact's clock runs; a contact held past half of it extends it.
export const HELD_CLOCK_MS = 60_000;

// The clock counts the JS thread's performance.now(), which stamps each halo, and runs on the UI
// thread while a contact is down and until the last grow-in or lift-off ends. Reduced motion is the
// halo model's own answer, so Reanimated's system-setting shortcut must not cut the clock short.
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
  const track = useRef<HaloTrack>({ shown: [], settlesAt: -Infinity, held: false }).current;
  useEffect(() => {
    reducedMotion.value = reduced;
    const update = () => {
      const now = performance.now();
      track.shown = reconcileHalos(track.shown, feed.current(), now, reduced);
      shown.value = track.shown;
      const held = track.shown.some((entry) => !entry.lifting);
      const end = held ? now + HELD_CLOCK_MS : reduced ? -Infinity : haloMotionEnd(track.shown);
      // A held clock runs on until the lift, which cuts it to the lift-off's own end.
      const changed = held
        ? track.settlesAt - now < HELD_CLOCK_MS / 2
        : track.held || end > track.settlesAt;
      track.held = held;
      if (!changed) return;
      if (end <= now) cancelAnimation(clock);
      else runClock(clock, now, end, track.settlesAt > now);
      track.settlesAt = end;
    };
    update();
    const unsubscribe = feed.subscribe(update);
    return () => {
      unsubscribe();
      cancelAnimation(clock);
      track.settlesAt = -Infinity;
      track.held = false;
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
// replaying the ink beneath. The layer redraws on every frame a contact is down, as shipping's
// halo writes its transform on every pointer frame: the paper then presents a frame each vsync
// while drawing, rather than only when the JS thread's ink or halo update lands, and a frame that
// follows a skipped vsync no longer misses the shorter deadline Android gives it.
export const PointerHalos = memo(function PointerHalos({ feed }: { feed: HaloFeed }) {
  const picture = useHaloPicture(feed);
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none" testID="pointer-halos">
      <Picture picture={picture} />
    </Canvas>
  );
});

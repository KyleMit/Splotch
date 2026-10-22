import { useEffect, useRef, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { Animated } from '../platform/animated';
import type { UnavailableFeedback } from '../drawing/undoFeedback';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import { DRAWING_BRAND } from '../drawing/theme';
import { keyframeTimeline, keyframeValue, type Bezier } from './keyframeMotion';
import {
  UNAVAILABLE_FLASH_KEYFRAMES,
  UNAVAILABLE_FLASH_MS,
  UNAVAILABLE_GLOW_BRAND_SHARE,
  UNAVAILABLE_GLOW_FADE_SPREAD_PX,
  UNAVAILABLE_GLOW_SPREAD_PX,
  UNAVAILABLE_SHAKE_KEYFRAMES,
  UNAVAILABLE_SHAKE_MS,
} from './unavailableKeyframes';

// The motion of the unavailable cue, which the web loads with the other Undo cues. The tile's own
// wrapper (RsdUnavailableCue) stays on the startup path, so the chunk's arrival never remounts it.

// Shipping mixes --brand into transparent; React Native has no color-mix(), so the glow resolves
// against the unthemed brand hue (171, 113, 225), as the tile's hover shadow does.
const GLOW = `0 0 0 ${UNAVAILABLE_GLOW_SPREAD_PX}px rgba(171, 113, 225, ${UNAVAILABLE_GLOW_BRAND_SHARE})`;

// The keyframe timeline that plays the rest of a cue from its press, or none once it has run or
// when it may not play; the value then rests at 1, where every keyframe is at rest.
function cueTimeline(
  progress: Animated.Value,
  feedback: UnavailableFeedback | null,
  run: boolean,
  keyframes: readonly Readonly<{ at: number; easing: Bezier }>[],
  durationMs: number
) {
  const elapsedMs = feedback ? performance.now() - feedback.startedAt : durationMs;
  if (!feedback || !run || elapsedMs >= durationMs) {
    progress.setValue(1);
    return null;
  }
  progress.setValue(0);
  // The event clock survives a drawer remount and a late web chunk; neither restarts the cue.
  return keyframeTimeline(progress, keyframes, durationMs, 0, elapsedMs);
}

export function shakeTimeline(progress: Animated.Value, feedback: UnavailableFeedback | null) {
  return cueTimeline(
    progress,
    feedback,
    feedback?.reduced === false,
    UNAVAILABLE_SHAKE_KEYFRAMES,
    UNAVAILABLE_SHAKE_MS
  );
}

export function shakeTransform(progress: Animated.Value) {
  return [
    { translateX: keyframeValue(progress, UNAVAILABLE_SHAKE_KEYFRAMES, (frame) => frame.x) },
    {
      rotate: keyframeValue(
        progress,
        UNAVAILABLE_SHAKE_KEYFRAMES,
        (frame) => frame.rotate
      ).interpolate({ inputRange: [0, 1], outputRange: ['0deg', '1deg'] }),
    },
  ];
}

// A brand-washed copy of the tile at full opacity (`lit`, the glyph unmuted) flashes over its
// parked face, with a glow ring that outlasts the shake.
export function UnavailableFlash({
  feedback,
  size,
  radius,
  borderPx,
  lit,
}: {
  feedback: UnavailableFeedback | null;
  size: number;
  radius: number;
  borderPx: number;
  lit: ReactNode;
}) {
  const theme = useDrawingTheme();
  const flash = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const timeline = cueTimeline(
      flash,
      feedback,
      true,
      UNAVAILABLE_FLASH_KEYFRAMES,
      UNAVAILABLE_FLASH_MS
    );
    timeline?.start();
    return () => timeline?.stop();
  }, [feedback, flash]);
  const value = (pick: (frame: (typeof UNAVAILABLE_FLASH_KEYFRAMES)[number]) => number) =>
    keyframeValue(flash, UNAVAILABLE_FLASH_KEYFRAMES, pick);
  // Scaling the ringed copy moves the ring's outer edge from the glow spread to the fade spread.
  const glowScale = value((frame) => frame.spreadPx).interpolate({
    inputRange: [UNAVAILABLE_GLOW_SPREAD_PX, UNAVAILABLE_GLOW_FADE_SPREAD_PX],
    outputRange: [
      1,
      (size + 2 * UNAVAILABLE_GLOW_FADE_SPREAD_PX) / (size + 2 * UNAVAILABLE_GLOW_SPREAD_PX),
    ],
  });
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: radius,
            boxShadow: GLOW,
            opacity: value((frame) => frame.glow),
            transform: [{ scale: glowScale }],
          },
        ]}
      />
      <Animated.View
        testID="rsd-unavailable-flash"
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.lit,
          {
            borderRadius: radius,
            borderWidth: borderPx,
            borderColor: DRAWING_BRAND,
            backgroundColor: theme.brandWash,
            opacity: value((frame) => frame.lit),
          },
        ]}
      >
        {lit}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  lit: { alignItems: 'center', justifyContent: 'center' },
});

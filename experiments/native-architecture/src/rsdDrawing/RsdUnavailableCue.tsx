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

// Shipping mixes --brand into transparent; React Native has no color-mix(), so the glow resolves
// against the unthemed brand hue (171, 113, 225), as the tile's hover shadow does.
const GLOW = `0 0 0 ${UNAVAILABLE_GLOW_SPREAD_PX}px rgba(171, 113, 225, ${UNAVAILABLE_GLOW_BRAND_SHARE})`;

function useCueTimeline(
  feedback: UnavailableFeedback | null,
  run: boolean,
  keyframes: readonly Readonly<{ at: number; easing: Bezier }>[],
  durationMs: number
) {
  const progress = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const elapsedMs = feedback ? performance.now() - feedback.startedAt : durationMs;
    if (!feedback || !run || elapsedMs >= durationMs) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    // The event clock survives a drawer remount and a late web chunk; neither restarts the cue.
    const timeline = keyframeTimeline(progress, keyframes, durationMs, 0, elapsedMs);
    timeline.start();
    return () => timeline.stop();
  }, [feedback, run, durationMs, keyframes, progress]);
  return progress;
}

// The whole tile answers a press it cannot act on, as shipping's .action-unavailable does: the
// tile shakes, and a brand-washed copy of it at full opacity (`lit`, the glyph unmuted) flashes
// over its parked face with a glow ring that outlasts the shake.
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
  const theme = useDrawingTheme();
  const shake = useCueTimeline(
    feedback,
    feedback?.reduced === false,
    UNAVAILABLE_SHAKE_KEYFRAMES,
    UNAVAILABLE_SHAKE_MS
  );
  const flash = useCueTimeline(feedback, true, UNAVAILABLE_FLASH_KEYFRAMES, UNAVAILABLE_FLASH_MS);
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
    <Animated.View
      testID="rsd-unavailable-cue"
      style={{
        transform: [
          { translateX: keyframeValue(shake, UNAVAILABLE_SHAKE_KEYFRAMES, (frame) => frame.x) },
          {
            rotate: keyframeValue(
              shake,
              UNAVAILABLE_SHAKE_KEYFRAMES,
              (frame) => frame.rotate
            ).interpolate({ inputRange: [0, 1], outputRange: ['0deg', '1deg'] }),
          },
        ],
      }}
    >
      {children}
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  lit: { alignItems: 'center', justifyContent: 'center' },
});

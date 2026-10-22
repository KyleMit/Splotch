import { useEffect, useRef } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Animated, Easing } from '../platform/animated';
import { CALM_FADE_MS } from '../lib/motionDurations';
import { AiConfetti } from '../ai/AiConfetti';
import { AiProgressDial } from '../ai/AiProgressDial';
import type { AiProgress } from '../ai/aiProgress';
import type { AiRun } from '../ai/uiState';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import { useReduceMotion } from '../drawing/useReduceMotion';
import { useAiResultZoom } from '../ai/useAiResultZoom';

// AiResultStage.svelte's literals; native-ai-flow-geometry.test.mjs reads them back.
// The drawing stays blurry to keep the suspense, sharpening as the dial fills, in quarter-pixel
// steps so a half-minute run does not rewrite the blur every frame.
const STAGE_MIN_BLUR_PX = 2;
const STAGE_MAX_EXTRA_BLUR_PX = 16;
const STAGE_BLUR_STEP_PX = 0.25;
// Scaled up a little so the blur's soft edge falls outside the stage.
const STAGE_BLUR_BLEED_SCALE = 1.04;
const STAGE_PREVIEW_EXIT_MS = 500;
const STAGE_RESULT_FADE_MS = 550;
const STAGE_RESULT_SETTLE_MS = 600;
const STAGE_RESULT_ENTRY_SCALE = 1.08;
export const STAGE_SHADOW = '0px 4px 16px rgba(0, 0, 0, 0.15)';
const STAGE_RADIUS_PX = 12;
const GESTURE_POINTER = { touchAction: 'none' } as const;
// --ease-glide
const GLIDE = Easing.bezier(0.22, 1, 0.36, 1);

export function stageBlurPx(progress: number) {
  const blur = STAGE_MIN_BLUR_PX + STAGE_MAX_EXTRA_BLUR_PX * (1 - progress);
  return Math.round(blur / STAGE_BLUR_STEP_PX) * STAGE_BLUR_STEP_PX;
}

function useReveal(revealed: boolean, reduceMotion: boolean) {
  const preview = useRef(new Animated.Value(revealed ? 0 : 1)).current;
  const result = useRef(new Animated.Value(revealed ? 1 : 0)).current;
  const scale = useRef(
    new Animated.Value(revealed || reduceMotion ? 1 : STAGE_RESULT_ENTRY_SCALE)
  ).current;
  useEffect(() => {
    if (!revealed) return;
    const reveal = Animated.parallel([
      Animated.timing(preview, {
        toValue: 0,
        duration: reduceMotion ? CALM_FADE_MS : STAGE_PREVIEW_EXIT_MS,
        easing: Easing.ease,
        useNativeDriver: true,
      }),
      Animated.timing(result, {
        toValue: 1,
        duration: reduceMotion ? CALM_FADE_MS : STAGE_RESULT_FADE_MS,
        easing: Easing.ease,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: reduceMotion ? 0 : STAGE_RESULT_SETTLE_MS,
        easing: GLIDE,
        useNativeDriver: true,
      }),
    ]);
    reveal.start();
    return () => reveal.stop();
  }, [preview, reduceMotion, result, revealed, scale]);
  return { preview, result, scale };
}

// The AI Result's stage: the child's own drawing, blurred under the progress dial with confetti
// falling behind it, which the finished picture fades up through once the dial has filled.
export function RsdAiResultStage({
  run,
  progress,
  width,
  height,
  dialSize,
}: {
  run: AiRun | null;
  progress: AiProgress;
  width: number;
  height: number;
  dialSize: number;
}) {
  const { paper } = useDrawingTheme();
  const reduceMotion = useReduceMotion();
  const revealed = progress.revealed && !!run?.picture;
  const reveal = useReveal(revealed, reduceMotion);
  const zoom = useAiResultZoom(revealed, run?.picture?.uri, width, height);
  return (
    <View
      testID="ai-result-stage"
      style={[styles.stage, { width, height, backgroundColor: paper }]}
    >
      {run?.submitted ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: reveal.preview }]}>
          <Image
            testID="ai-submitted-drawing"
            accessible={false}
            source={{ uri: run.submitted }}
            blurRadius={stageBlurPx(progress.value)}
            resizeMode="contain"
            style={styles.preview}
          />
        </Animated.View>
      ) : null}
      {run?.picture ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { opacity: reveal.result, transform: [{ scale: reveal.scale }] },
          ]}
        >
          <View
            testID="ai-zoomed-picture"
            style={{ ...styles.fill, transformOrigin: 'top left', transform: zoom.transform }}
          >
            <Image
              testID="ai-result-picture"
              accessibilityLabel="Your AI picture"
              source={{ uri: run.picture.uri }}
              resizeMode="contain"
              style={styles.fill}
            />
          </View>
        </Animated.View>
      ) : null}
      {/* Under reduced motion the dial alone says something is happening. */}
      {revealed || reduceMotion ? null : <AiConfetti height={height} />}
      <View pointerEvents="none" style={styles.center}>
        <AiProgressDial progress={progress} size={dialSize} reduceMotion={reduceMotion} />
      </View>
      <View
        testID="ai-result-gesture"
        pointerEvents={revealed ? 'box-only' : 'none'}
        style={{ ...StyleSheet.absoluteFill, ...GESTURE_POINTER }}
        {...zoom.handlers}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: STAGE_RADIUS_PX,
    boxShadow: STAGE_SHADOW,
  },
  fill: { width: '100%', height: '100%' },
  preview: { width: '100%', height: '100%', transform: [{ scale: STAGE_BLUR_BLEED_SCALE }] },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});

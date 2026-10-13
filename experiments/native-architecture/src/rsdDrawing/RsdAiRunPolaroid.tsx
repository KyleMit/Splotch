import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { css, html } from 'react-strict-dom';
import {
  DIAL_MAX_SIZE_PX,
  DIAL_STAGE_FRACTION,
} from '../../../../web/src/lib/components/aiDialGeometry';
import { CALM_FADE_MS } from '../../../../web/src/lib/motionDurations';
import { AiConfetti } from '../ai/AiConfetti';
import { AiProgressDial } from '../ai/AiProgressDial';
import type { AiProgressOwner } from '../ai/aiProgress';
import { useAiProgress } from '../ai/useAiProgress';
import { AI_RESULT_HEIGHT_PX, type AiRun } from '../ai/uiState';
import { PAPER_HEIGHT, PAPER_WIDTH } from '../drawing/model';
import { DRAWING_POLAROID } from '../drawing/theme';
import { useReduceMotion } from '../drawing/useReduceMotion';
import { dimensions } from './tokens.css';

const STAGE_WIDTH_PX = (AI_RESULT_HEIGHT_PX * PAPER_WIDTH) / PAPER_HEIGHT;
const DIAL_SIZE_PX = Math.min(STAGE_WIDTH_PX * DIAL_STAGE_FRACTION, DIAL_MAX_SIZE_PX);
// The drawing stays soft to keep the suspense, sharpening as the dial fills. Gentler
// than the web stage's ramp: this print is a phone-width window, where the web's
// starting blur dissolves a toddler's thin strokes into blank paper.
const MIN_BLUR_PX = 1;
const MAX_EXTRA_BLUR_PX = 5;
// Scaled up a little so the blur's soft edge falls outside the window.
const BLUR_BLEED_SCALE = 1.04;
const PREVIEW_OPACITY = 0.85;
const PREVIEW_EXIT_MS = 500;
const RESULT_FADE_MS = 550;
const RESULT_SETTLE_MS = 600;
const RESULT_ENTRY_SCALE = 1.08;
const PRINT_PADDING_PX = 10;
const PRINT_CAPTION_PX = 28;
const PRINT_RADIUS_PX = 4;
const WINDOW_RADIUS_PX = 2;

function useReveal(revealed: boolean, reduceMotion: boolean) {
  const preview = useRef(new Animated.Value(revealed ? 0 : PREVIEW_OPACITY)).current;
  const result = useRef(new Animated.Value(revealed ? 1 : 0)).current;
  const scale = useRef(
    new Animated.Value(revealed || reduceMotion ? 1 : RESULT_ENTRY_SCALE)
  ).current;
  useEffect(() => {
    if (!revealed) return;
    const glide = Easing.out(Easing.cubic);
    const reveal = Animated.parallel([
      Animated.timing(preview, {
        toValue: 0,
        duration: reduceMotion ? CALM_FADE_MS : PREVIEW_EXIT_MS,
        easing: glide,
        useNativeDriver: true,
      }),
      Animated.timing(result, {
        toValue: 1,
        duration: reduceMotion ? CALM_FADE_MS : RESULT_FADE_MS,
        easing: glide,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: reduceMotion ? 0 : RESULT_SETTLE_MS,
        easing: glide,
        useNativeDriver: true,
      }),
    ]);
    reveal.start();
    return () => reveal.stop();
  }, [preview, reduceMotion, result, revealed, scale]);
  return { preview, result, scale };
}

// The print the sheet shows for the picture being made: the child's own drawing,
// blurred under the progress dial with confetti falling behind it, which the
// finished picture fades up through once the dial has filled.
export function RsdAiRunPolaroid({
  run,
  progress: owner,
}: {
  run: AiRun;
  progress: AiProgressOwner;
}) {
  const progress = useAiProgress(owner);
  const reduceMotion = useReduceMotion();
  const reveal = useReveal(progress.revealed, reduceMotion);
  const blur = Math.round(MIN_BLUR_PX + MAX_EXTRA_BLUR_PX * (1 - progress.value));
  return (
    <View style={styles.print} testID="ai-run-polaroid">
      <View style={styles.window}>
        {run.submitted ? (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: reveal.preview }]}>
            <Image
              testID="ai-submitted-drawing"
              accessible={false}
              source={{ uri: run.submitted }}
              blurRadius={blur}
              resizeMode="cover"
              style={styles.preview}
            />
          </Animated.View>
        ) : null}
        {run.picture ? (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { opacity: reveal.result, transform: [{ scale: reveal.scale }] },
            ]}
          >
            <html.img alt="Your AI picture" src={run.picture.uri} style={pictureStyles.image} />
          </Animated.View>
        ) : null}
        {/* Under reduced motion the dial alone says something is happening. */}
        {progress.revealed || reduceMotion ? null : <AiConfetti height={AI_RESULT_HEIGHT_PX} />}
        <View pointerEvents="none" style={styles.center}>
          <AiProgressDial progress={progress} size={DIAL_SIZE_PX} reduceMotion={reduceMotion} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  print: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: STAGE_WIDTH_PX + 2 * PRINT_PADDING_PX,
    padding: PRINT_PADDING_PX,
    paddingBottom: PRINT_CAPTION_PX,
    borderRadius: PRINT_RADIUS_PX,
    backgroundColor: DRAWING_POLAROID.paper,
    boxShadow: '0px 10px 24px rgba(0, 0, 0, 0.28), 0px 3px 8px rgba(0, 0, 0, 0.18)',
  },
  window: {
    height: AI_RESULT_HEIGHT_PX,
    borderRadius: WINDOW_RADIUS_PX,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  preview: { width: '100%', height: '100%', transform: [{ scale: BLUR_BLEED_SCALE }] },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
});

const pictureStyles = css.create({
  image: { width: '100%', height: dimensions.aiResultHeight, objectFit: 'contain' },
});

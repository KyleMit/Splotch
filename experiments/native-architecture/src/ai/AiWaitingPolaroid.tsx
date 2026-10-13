import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { DRAWING_BRAND, DRAWING_POLAROID, DRAWING_SCALE } from '../drawing/theme';
import { useReduceMotion } from '../drawing/useReduceMotion';
import { useAiProgress } from './useAiProgress';
import type { AiProgressOwner } from './aiProgress';
import type { AiRun } from './uiState';

type Face = 'waiting' | 'ready' | 'failed';

const LABELS: Record<Face, string> = {
  waiting: 'Your picture is being made — tap to watch',
  ready: 'Your picture is ready — tap to see it',
  failed: "That didn't work — tap to see",
};

const PRINT_WIDTH_PX = 104;
const PHOTO_HEIGHT_PX = 68;
const TILT_DEG = -5;
const SPINNER_SIZE_PX = 18;
const SPINNER_MS = 900;
// The spinner slows rather than stopping: it is the only sign left that anything is happening.
const CALM_SPINNER_MS = 2400;
const WIGGLE_DELAY_MS = 150;
const WIGGLE_CYCLE_MS = 2600;
// Two passes per cycle, the second at half the swing, so the print settles
// instead of stopping. Each stop is [fraction of the cycle, tilt, scale].
const WIGGLE_STOPS: readonly (readonly [number, number, number])[] = [
  [0, TILT_DEG, 1],
  [0.09, 0.5, 1.045],
  [0.2, -8, 1.028],
  [0.3, -3.4, 1.035],
  [0.42, TILT_DEG, 1],
  [0.56, TILT_DEG, 1],
  [0.63, -2.6, 1.022],
  [0.72, -6.6, 1.014],
  [0.8, -4.2, 1.017],
  [0.9, TILT_DEG, 1],
  [1, TILT_DEG, 1],
];
const READY_WIGGLES = 2;
// Repeated delight over "Oh no" is the app celebrating a disappointment.
const FAILED_WIGGLES = 1;
const PERCENT = 100;
const MUTED_INK = 'rgba(0, 0, 0, 0.55)';
// The spinner's resting ring: the brand hue at a quarter strength.
const SPINNER_RING = `${DRAWING_BRAND}40`;
const PRINT_RADIUS_PX = 4;
const PRINT_INSET_PX = 7;
const PRINT_BOTTOM_INSET_PX = 8;
const PHOTO_RADIUS_PX = 2;
const CAPTION_HEIGHT_PX = 20;
const CAPTION_GAP_PX = 6;
const TRACK_HEIGHT_PX = 6;
const CAPTION_FONT_SIZE_PX = 12;

function faceOf(run: AiRun): Face {
  return run.phase === 'arrived' ? 'ready' : run.phase;
}

function useSpin(active: boolean, reduceMotion: boolean) {
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const spin = Animated.loop(
      Animated.timing(turn, {
        toValue: 1,
        duration: reduceMotion ? CALM_SPINNER_MS : SPINNER_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    spin.start();
    return () => spin.stop();
  }, [active, reduceMotion, turn]);
  return turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
}

function useWiggle(face: Face, reduceMotion: boolean) {
  const cycle = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (face === 'waiting' || reduceMotion) return;
    cycle.setValue(0);
    const wiggle = Animated.sequence([
      Animated.delay(WIGGLE_DELAY_MS),
      Animated.timing(cycle, {
        toValue: face === 'failed' ? FAILED_WIGGLES : READY_WIGGLES,
        duration: WIGGLE_CYCLE_MS * (face === 'failed' ? FAILED_WIGGLES : READY_WIGGLES),
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ]);
    wiggle.start();
    return () => wiggle.stop();
  }, [cycle, face, reduceMotion]);
  const passes = Array.from({ length: READY_WIGGLES }, (_, pass) =>
    WIGGLE_STOPS.slice(pass === 0 ? 0 : 1).map(([at, tilt, scale]) => [pass + at, tilt, scale])
  ).flat();
  const inputRange = passes.map(([at]) => at);
  return {
    rotate: cycle.interpolate({ inputRange, outputRange: passes.map(([, tilt]) => `${tilt}deg`) }),
    scale: cycle.interpolate({ inputRange, outputRange: passes.map(([, , scale]) => scale) }),
  };
}

// The picture-in-progress, pinned to the top-left of the paper while the child
// keeps drawing. It is the way back into a minimized run, so a picture that is
// already being made can never be lost by minimizing it.
export function AiWaitingPolaroid({
  run,
  progress: owner,
  onRestore,
}: {
  run: AiRun;
  progress: AiProgressOwner;
  onRestore: () => void;
}) {
  const progress = useAiProgress(owner);
  const reduceMotion = useReduceMotion();
  const face = faceOf(run);
  const spin = useSpin(face === 'waiting', reduceMotion);
  const wiggle = useWiggle(face, reduceMotion);
  const photo = face === 'ready' ? run.picture?.uri : run.submitted;
  return (
    <Animated.View
      style={[styles.anchor, { transform: [{ rotate: wiggle.rotate }, { scale: wiggle.scale }] }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={LABELS[face]}
        testID="ai-waiting-polaroid"
        onPress={onRestore}
        style={styles.print}
      >
        <View style={styles.window}>
          {photo ? (
            <Image
              accessible={false}
              source={{ uri: photo }}
              blurRadius={face === 'ready' ? 0 : 1}
              resizeMode="cover"
              style={[styles.photo, face !== 'ready' && styles.waitingArt]}
            />
          ) : null}
          {face === 'waiting' ? (
            <Animated.View style={[styles.spinner, { transform: [{ rotate: spin }] }]} />
          ) : null}
        </View>
        <View style={styles.caption}>
          {face === 'waiting' ? (
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.round(progress.value * PERCENT)}%` }]} />
            </View>
          ) : (
            <Text style={[styles.captionText, face === 'failed' && styles.mutedText]}>
              {face === 'failed' ? 'Oh no' : 'Ready!'}
            </Text>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    top: DRAWING_SCALE.space4,
    left: DRAWING_SCALE.space4,
  },
  print: {
    width: PRINT_WIDTH_PX,
    paddingTop: PRINT_INSET_PX,
    paddingHorizontal: PRINT_INSET_PX,
    paddingBottom: PRINT_BOTTOM_INSET_PX,
    borderRadius: PRINT_RADIUS_PX,
    backgroundColor: DRAWING_POLAROID.paper,
    boxShadow: '0px 10px 24px rgba(0, 0, 0, 0.28), 0px 3px 8px rgba(0, 0, 0, 0.18)',
  },
  window: {
    height: PHOTO_HEIGHT_PX,
    borderRadius: PHOTO_RADIUS_PX,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  photo: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  waitingArt: { opacity: 0.5 },
  spinner: {
    width: SPINNER_SIZE_PX,
    height: SPINNER_SIZE_PX,
    borderRadius: SPINNER_SIZE_PX / 2,
    borderWidth: 2,
    borderColor: SPINNER_RING,
    borderTopColor: DRAWING_BRAND,
  },
  caption: {
    height: CAPTION_HEIGHT_PX,
    marginTop: CAPTION_GAP_PX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    width: '100%',
    height: TRACK_HEIGHT_PX,
    borderRadius: TRACK_HEIGHT_PX / 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  fill: {
    height: '100%',
    borderRadius: TRACK_HEIGHT_PX / 2,
    backgroundColor: DRAWING_POLAROID.ink,
  },
  captionText: {
    color: DRAWING_POLAROID.ink,
    fontSize: CAPTION_FONT_SIZE_PX,
    fontWeight: DRAWING_SCALE.fontWeightBold,
  },
  mutedText: { color: MUTED_INK },
});

import { useEffect, useRef } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { css, html } from 'react-strict-dom';
import { Animated, Easing } from '../platform/animated';
import { Text } from '../drawing/Text';
import { useDrawingTheme } from '../drawing/DrawingAppearance';
import { DRAWING_BRAND, DRAWING_POLAROID, DRAWING_SCALE } from '../drawing/theme';
import { useReduceMotion } from '../drawing/useReduceMotion';
import { RsdIcon } from '../rsdDrawing/RsdIcon';
import { useAiProgress } from './useAiProgress';
import type { AiProgressOwner } from './aiProgress';
import type { AiCornerFace, AiRun } from './uiState';

const LABELS: Record<AiCornerFace, string> = {
  waiting: 'Your picture is being made — tap to watch',
  ready: 'Your picture is ready — tap to see it',
  failed: "That didn't work — tap to see",
};

// AiWaitingPolaroid.svelte's literals; native-ai-flow-geometry.test.mjs reads them back.
export const PRINT_WIDTH_PX = 104;
export const PHOTO_HEIGHT_PX = 68;
export const TILT_DEG = -5;
// Where the print pins: below the portrait palette bar, or beside the landscape column with room
// for the ready wiggle and its badge above it.
export const POLAROID_PORTRAIT_INSET_PX = 16;
export const POLAROID_HEADROOM_PX = 30;
export const POLAROID_CLEARANCE_PX = 28;
export const BADGE_ICON_PX = 28;
export const BADGE_OFFSET = { top: -12, right: -10 } as const;
const SPINNER_SIZE_PX = 18;
const SPINNER_MS = 900;
// The spinner slows rather than stopping: it is the only sign left that anything is happening.
const CALM_SPINNER_MS = 2400;
const ARRIVAL_MS = 400;
const BADGE_POP_MS = 560;
const WIGGLE_DELAY_MS = 150;
const WIGGLE_CYCLE_MS = 2600;
// Arrival: a pop and a wiggle, not a takeover. Each stop is [fraction, tilt, scale, lift, opacity].
const ARRIVAL_STOPS: readonly (readonly [number, number, number, number, number])[] = [
  [0, 6, 0.62, -18, 0],
  [0.62, -7, 1.04, 0, 1],
  [0.84, -3.4, 0.995, 0, 1],
  [1, TILT_DEG, 1, 0, 1],
];
// The badge pops on like a sticker. Each stop is [fraction, scale, turn].
const BADGE_STOPS: readonly (readonly [number, number, number])[] = [
  [0, 0, -22],
  [0.62, 1.18, 5],
  [0.84, 0.97, -2],
  [1, 1, 0],
];
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
const DEG = 'deg';

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

function useOnce(duration: number, delay: number, run: boolean) {
  const clock = useRef(new Animated.Value(run ? 0 : 1)).current;
  useEffect(() => {
    if (!run) {
      clock.setValue(1);
      return;
    }
    clock.setValue(0);
    const once = Animated.sequence([
      Animated.delay(delay),
      Animated.timing(clock, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ]);
    once.start();
    return () => once.stop();
  }, [clock, delay, duration, run]);
  return clock;
}

function useWiggle(face: AiCornerFace, reduceMotion: boolean) {
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
    rotate: cycle.interpolate({ inputRange, outputRange: passes.map(([, tilt]) => tilt) }),
    scale: cycle.interpolate({ inputRange, outputRange: passes.map(([, , scale]) => scale) }),
  };
}

function stops<Stop extends readonly number[]>(
  clock: Animated.Value,
  table: readonly Stop[],
  pick: (stop: Stop) => number
) {
  return clock.interpolate({ inputRange: table.map(([at]) => at), outputRange: table.map(pick) });
}

const asDegrees = (value: Animated.AnimatedInterpolation<number>) =>
  value.interpolate({ inputRange: [-360, 360], outputRange: [`-360${DEG}`, `360${DEG}`] });

// The picture-in-progress, pinned to the paper's top-left corner while the child keeps drawing
// (ADR-0116, ADR-0117). It is the way back into a minimized run, so a picture that is already
// being made can never be lost by minimizing it.
export function AiWaitingPolaroid({
  run,
  face,
  portrait,
  progress: owner,
  onRestore,
}: {
  run: AiRun;
  face: AiCornerFace;
  portrait: boolean;
  progress: AiProgressOwner;
  onRestore: () => void;
}) {
  const progress = useAiProgress(owner);
  const reduceMotion = useReduceMotion();
  const spin = useSpin(face === 'waiting', reduceMotion);
  const wiggle = useWiggle(face, reduceMotion);
  const arrival = useOnce(ARRIVAL_MS, 0, !reduceMotion);
  const ready = face === 'ready';
  const pop = useOnce(BADGE_POP_MS, 0, ready && !reduceMotion);
  const photo = ready ? run.picture?.uri : run.submitted;
  const tilt = Animated.add(
    stops(arrival, ARRIVAL_STOPS, ([, turn]) => turn - TILT_DEG),
    wiggle.rotate
  );
  return (
    <Animated.View
      style={[
        styles.anchor,
        portrait ? styles.portrait : styles.landscape,
        {
          opacity: stops(arrival, ARRIVAL_STOPS, ([, , , , opacity]) => opacity),
          transform: [
            { translateY: stops(arrival, ARRIVAL_STOPS, ([, , , lift]) => lift) },
            { rotate: asDegrees(tilt) },
            {
              scale: Animated.multiply(
                stops(arrival, ARRIVAL_STOPS, ([, , scale]) => scale),
                wiggle.scale
              ),
            },
          ],
        },
      ]}
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
              blurRadius={ready ? 0 : 1}
              resizeMode="cover"
              style={[styles.photo, !ready && styles.waitingArt]}
            />
          ) : null}
          {face === 'waiting' ? (
            <Animated.View style={[styles.spinner, { transform: [{ rotate: spin }] }]} />
          ) : null}
        </View>
        <View style={styles.caption}>
          {face === 'waiting' ? (
            <View style={styles.track}>
              <ProgressFill percent={Math.round(progress.value * PERCENT)} />
            </View>
          ) : (
            <Text style={[styles.captionText, face === 'failed' && styles.mutedText]}>
              {face === 'failed' ? 'Oh no' : 'Ready!'}
            </Text>
          )}
        </View>
      </Pressable>
      {ready ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.badge,
            {
              transform: [
                { scale: stops(pop, BADGE_STOPS, ([, scale]) => scale) },
                { rotate: asDegrees(stops(pop, BADGE_STOPS, ([, , turn]) => turn)) },
              ],
            },
          ]}
        >
          <RsdIcon name="wand-stars" size={BADGE_ICON_PX} ink={undefined} muted={false} />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

// The fill runs from the brand hue to its solid shade, as shipping's caption bar does.
function ProgressFill({ percent }: { percent: number }) {
  const { brandSolid } = useDrawingTheme();
  return (
    <html.div
      style={fill.bar(`${percent}%`, `linear-gradient(90deg, ${DRAWING_BRAND}, ${brandSolid})`)}
    />
  );
}

const fill = css.create({
  bar: (width: string, backgroundImage: string) => ({
    width,
    height: '100%',
    borderRadius: TRACK_HEIGHT_PX / 2,
    backgroundImage,
  }),
});

const styles = StyleSheet.create({
  anchor: { position: 'absolute' },
  portrait: { top: POLAROID_PORTRAIT_INSET_PX, left: POLAROID_PORTRAIT_INSET_PX },
  landscape: { top: POLAROID_HEADROOM_PX, left: POLAROID_CLEARANCE_PX },
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
  captionText: {
    color: DRAWING_POLAROID.ink,
    fontSize: CAPTION_FONT_SIZE_PX,
    fontWeight: DRAWING_SCALE.fontWeightBold,
  },
  mutedText: { color: MUTED_INK },
  badge: { position: 'absolute', top: BADGE_OFFSET.top, right: BADGE_OFFSET.right },
});

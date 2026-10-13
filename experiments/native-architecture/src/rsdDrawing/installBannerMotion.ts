import { useCallback, useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Animated, Easing } from '../platform/animated';
import {
  BANNER_ENTER_MS,
  BANNER_EXIT_MS,
  BANNER_FLY_PX,
} from '../../../../web/src/lib/components/bannerMotion';
import { CALM_FADE_MS } from '../../../../web/src/lib/motionDurations';
import { TOUCH_TARGET } from '../drawing/theme';
import { useReduceMotion } from '../drawing/useReduceMotion';
import { EDGE_INSET_PX } from './edgeLayout';

// InstallBanner.svelte's own timings; tools/tests/native-install-banner-drift.test.mjs reads each
// back from the shipping source.
export const INSTALL_BANNER_MOTION = {
  partingFadeMs: 200,
  hintFadeMs: 160,
  shrinkExitMs: 550,
} as const;

// svelte/easing's backOut and cubicOut, and the shrink exit's cubicIn.
const BACK_OUT = Easing.out(Easing.back(1.70158));
const CUBIC_OUT = Easing.out(Easing.cubic);
const CUBIC_IN = Easing.in(Easing.cubic);

export type Box = Readonly<{ x: number; y: number; width: number; height: number }>;
type Exit = Readonly<{ kind: 'fly' } | { kind: 'shrink'; dx: number; dy: number }>;
type Shown = Readonly<{ parting: boolean }>;

// The auto-clear exit shrinks the parting card into the Settings Button, docked in the paper
// area's bottom-right corner, so "it lives in Settings" lands visually too.
export function shrinkTarget(area: Box | null, card: Box | null): Exit {
  if (!area || !card) return { kind: 'shrink', dx: 0, dy: BANNER_FLY_PX };
  const settings = EDGE_INSET_PX + TOUCH_TARGET / 2;
  return {
    kind: 'shrink',
    dx: area.width - settings - (card.x + card.width / 2),
    dy: area.height - settings - (card.y + card.height / 2),
  };
}

export function boxOf({ nativeEvent }: LayoutChangeEvent): Box {
  const { x, y, width, height } = nativeEvent.layout;
  return { x, y, width, height };
}

// Keeps the content the banner last showed until its exit has played: Svelte freezes an
// outroing block, so the parting message is what shrinks into Settings.
export function useBannerPresence(present: boolean, parting: boolean) {
  const [shown, setShown] = useState<Shown | null>(present ? { parting } : null);
  if (present && shown?.parting !== parting) setShown({ parting });
  const gone = useCallback(() => setShown(null), []);
  return { shown, gone };
}

function exitTiming(exit: Exit, calm: boolean) {
  if (calm) return { duration: CALM_FADE_MS, easing: Easing.linear };
  return exit.kind === 'shrink'
    ? { duration: INSTALL_BANNER_MOTION.shrinkExitMs, easing: CUBIC_IN }
    : { duration: BANNER_EXIT_MS, easing: CUBIC_OUT };
}

function motionStyle(progress: Animated.Value, exit: Exit, calm: boolean) {
  const opacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  if (calm) return { opacity };
  const from = (start: number) =>
    progress.interpolate({ inputRange: [0, 1], outputRange: [start, 0] });
  if (exit.kind === 'shrink')
    return {
      opacity,
      transform: [
        { translateX: from(exit.dx) },
        { translateY: from(exit.dy) },
        { scale: progress },
      ],
    };
  return { opacity, transform: [{ translateY: from(BANNER_FLY_PX) }] };
}

// The shipping enter and exits: a fly up from the dock with a slight overshoot, a fly back down
// on a dismissal or an install, the shrink into Settings after the parting message, and under
// Reduce Motion a short fade for all of them.
export function useBannerMotion(
  present: boolean,
  shown: Shown | null,
  gone: () => void,
  measure: () => Exit
) {
  const calm = useReduceMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const [exit, setExit] = useState<Exit>({ kind: 'fly' });
  const leaving = !present && shown !== null ? (shown.parting ? 'shrink' : 'fly') : null;
  useEffect(() => {
    if (!present) return;
    setExit({ kind: 'fly' });
    const enter = Animated.timing(progress, {
      toValue: 1,
      duration: calm ? CALM_FADE_MS : BANNER_ENTER_MS,
      easing: calm ? Easing.linear : BACK_OUT,
      useNativeDriver: true,
    });
    enter.start();
    return () => enter.stop();
  }, [present, calm, progress]);
  useEffect(() => {
    if (!leaving) return;
    const next: Exit = leaving === 'shrink' ? measure() : { kind: 'fly' };
    setExit(next);
    const leave = Animated.timing(progress, {
      toValue: 0,
      ...exitTiming(next, calm),
      useNativeDriver: true,
    });
    leave.start(({ finished }) => {
      if (finished) gone();
    });
    return () => leave.stop();
  }, [leaving, calm, progress, measure, gone]);
  return motionStyle(progress, exit, calm);
}

// Svelte's fade transition: the content fades in as it mounts and, when it closes, out before it
// leaves.
export function useFade(shown: boolean, durationMs: number) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(shown);
  if (shown && !mounted) setMounted(true);
  useEffect(() => {
    if (!shown && !mounted) return;
    const fade = Animated.timing(opacity, {
      toValue: shown ? 1 : 0,
      duration: durationMs,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    fade.start(({ finished }) => {
      if (finished && !shown) setMounted(false);
    });
    return () => fade.stop();
  }, [shown, mounted, durationMs, opacity]);
  return { mounted: shown || mounted, opacity };
}

import { useEffect, useId, useRef, useState } from 'react';
import { Animated, Easing } from '../platform/animated';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { dialColors } from '../../../../web/src/lib/ai/dialColors';
import { CALM_FADE_MS } from '../../../../web/src/lib/motionDurations';
import type { AiProgress } from './aiProgress';

const PULSE_HALF_MS = 800;
const PULSE_SCALE = 1.045;
const EXIT_MS = 480;
const EXIT_SCALE = 1.35;
// The glow spills past the dial's own edge, so the drawing surface is wider than it.
const GLOW_SPREAD = 1.28;
const GLOW_OPACITY = 0.5;
const CORE_FRACTION = 0.07;
const FULL_TURN_DEG = 360;
const HALF_TURN_DEG = 180;
const PERCENT = 100;

function wedgePath(center: number, radius: number, sweepDeg: number) {
  const radians = (sweepDeg * Math.PI) / HALF_TURN_DEG;
  const x = center + radius * Math.sin(radians);
  const y = center - radius * Math.cos(radians);
  const largeArc = sweepDeg > HALF_TURN_DEG ? 1 : 0;
  return `M ${center} ${center} L ${center} ${center - radius} A ${radius} ${radius} 0 ${largeArc} 1 ${x} ${y} Z`;
}

function usePulse(scale: Animated.Value, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const pulse = Animated.loop(
      Animated.sequence(
        [PULSE_SCALE, 1].map((toValue) =>
          Animated.timing(scale, {
            toValue,
            duration: PULSE_HALF_MS,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          })
        )
      )
    );
    pulse.start();
    return () => {
      pulse.stop();
      scale.setValue(1);
    };
  }, [active, scale]);
}

function useExit(scale: Animated.Value, opacity: Animated.Value, leaving: boolean, calm: boolean) {
  const [gone, setGone] = useState(leaving);
  useEffect(() => {
    if (!leaving || gone) return;
    const fade = Animated.timing(opacity, {
      toValue: 0,
      duration: calm ? CALM_FADE_MS : EXIT_MS,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    });
    const exit = calm
      ? fade
      : Animated.parallel([
          fade,
          Animated.timing(scale, {
            toValue: EXIT_SCALE,
            duration: EXIT_MS,
            easing: Easing.out(Easing.back(1)),
            useNativeDriver: true,
          }),
        ]);
    exit.start(() => setGone(true));
    return () => exit.stop();
  }, [calm, gone, leaving, opacity, scale]);
  return gone;
}

export function AiProgressDial({
  progress,
  size,
  reduceMotion,
}: {
  progress: AiProgress;
  size: number;
  reduceMotion: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  usePulse(scale, progress.overrun && !progress.revealed && !reduceMotion);
  const gone = useExit(scale, opacity, progress.revealed, reduceMotion);
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  if (gone) return null;
  const canvas = size * GLOW_SPREAD;
  const center = canvas / 2;
  const radius = size / 2;
  const colors = dialColors(progress.value);
  const sweep = (1 - progress.value) * FULL_TURN_DEG;
  return (
    <Animated.View
      pointerEvents="none"
      style={{ width: canvas, height: canvas, opacity, transform: [{ scale }] }}
      testID="ai-progress-dial"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="AI picture progress"
      accessibilityValue={{ min: 0, max: PERCENT, now: Math.round(progress.value * PERCENT) }}
    >
      <Svg width={canvas} height={canvas} viewBox={`0 0 ${canvas} ${canvas}`}>
        <Defs>
          <RadialGradient id={`${id}glow`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={colors.end} stopOpacity={GLOW_OPACITY} />
            <Stop offset="0.57" stopColor={colors.start} stopOpacity={GLOW_OPACITY} />
            <Stop offset="1" stopColor={colors.start} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id={`${id}fill`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.start} />
            <Stop offset="1" stopColor={colors.end} />
          </LinearGradient>
          <RadialGradient id={`${id}sheen`} cx="38%" cy="32%" r="60%">
            <Stop offset="0" stopColor="#fff" stopOpacity={0.55} />
            <Stop offset="0.53" stopColor="#fff" stopOpacity={0.12} />
            <Stop offset="1" stopColor="#fff" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={center} cy={center} r={center} fill={`url(#${id}glow)`} />
        <Circle cx={center} cy={center} r={radius} fill="#fff" fillOpacity={0.1} />
        {sweep >= FULL_TURN_DEG ? (
          <Circle cx={center} cy={center} r={radius} fill={`url(#${id}fill)`} />
        ) : sweep > 0 ? (
          <Path d={wedgePath(center, radius, sweep)} fill={`url(#${id}fill)`} />
        ) : null}
        <Circle cx={center} cy={center} r={radius} fill={`url(#${id}sheen)`} />
        <Circle cx={center} cy={center} r={size * CORE_FRACTION} fill="#fff" />
      </Svg>
    </Animated.View>
  );
}

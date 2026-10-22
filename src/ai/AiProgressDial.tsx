import { useEffect, useId, useRef, useState } from 'react';
import { Animated, Easing } from '../platform/animated';
import { Svg, Circle, Defs, Path, RadialGradient, Stop } from '../platform/svg';
import { dialColors } from '../lib/ai/dialColors';
import { CALM_FADE_MS } from '../lib/motionDurations';
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
// Neighbouring slices overlap by this much so no hairline of the track shows between them.
const SLICE_SEAM_PX = 0.5;

// The pie is shipping's conic-gradient, which react-native-svg cannot paint: the wedge is cut
// into narrow slices, each filled with the gradient's color at its middle. A slice this narrow
// shows no step at the dial's largest size.
const CONIC_SLICE_DEG = 4;

function wedgePath(center: number, radius: number, fromDeg: number, toDeg: number) {
  const point = (deg: number) => {
    const radians = (deg * Math.PI) / HALF_TURN_DEG;
    return `${center + radius * Math.sin(radians)} ${center - radius * Math.cos(radians)}`;
  };
  const largeArc = toDeg - fromDeg > HALF_TURN_DEG ? 1 : 0;
  return `M ${center} ${center} L ${point(fromDeg)} A ${radius} ${radius} 0 ${largeArc} 1 ${point(toDeg)} Z`;
}

function hslChannels(color: string) {
  const [hue, saturation, lightness] = (/hsl\(([^)]+)\)/.exec(color)?.[1] ?? '0,0%,0%')
    .split(',')
    .map((part) => Number.parseFloat(part));
  const s = saturation / PERCENT;
  const l = lightness / PERCENT;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  return [0, 8, 4].map((offset) => {
    const k = (offset + hue / 30) % 12;
    return 255 * (l - (chroma / 2) * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  });
}

// conic-gradient(from 0deg, start, end <sweep>): the color a CSS gradient reaches at `fraction`,
// interpolated in sRGB as browsers do.
function conicSlices(start: string, end: string, sweepDeg: number) {
  const from = hslChannels(start);
  const to = hslChannels(end);
  const count = Math.max(1, Math.ceil(sweepDeg / CONIC_SLICE_DEG));
  return Array.from({ length: count }, (_, index) => {
    const fromDeg = (sweepDeg * index) / count;
    const toDeg = (sweepDeg * (index + 1)) / count;
    const fraction = (index + 0.5) / count;
    const rgb = from.map((value, channel) => Math.round(value + (to[channel] - value) * fraction));
    return { fromDeg, toDeg, color: `rgb(${rgb.join(', ')})` };
  });
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
          <RadialGradient id={`${id}sheen`} cx="38%" cy="32%" r="60%">
            <Stop offset="0" stopColor="#fff" stopOpacity={0.55} />
            <Stop offset="0.53" stopColor="#fff" stopOpacity={0.12} />
            <Stop offset="1" stopColor="#fff" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={center} cy={center} r={center} fill={`url(#${id}glow)`} />
        <Circle cx={center} cy={center} r={radius} fill="#fff" fillOpacity={0.1} />
        {sweep > 0
          ? conicSlices(colors.start, colors.end, sweep).map((slice) => (
              <Path
                key={slice.fromDeg}
                d={wedgePath(center, radius, slice.fromDeg, slice.toDeg)}
                fill={slice.color}
                stroke={slice.color}
                strokeWidth={SLICE_SEAM_PX}
              />
            ))
          : null}
        <Circle cx={center} cy={center} r={radius} fill={`url(#${id}sheen)`} />
        <Circle cx={center} cy={center} r={size * CORE_FRACTION} fill="#fff" />
      </Svg>
    </Animated.View>
  );
}

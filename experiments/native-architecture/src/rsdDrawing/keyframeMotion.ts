import { Animated, Easing } from '../platform/animated';

export type Bezier = readonly [number, number, number, number];

type Timed = Readonly<{ at: number; easing: Bezier }>;

// Each keyframe gap under that gap's own curve, as one easing over the whole animation, so a value
// interpolated linearly over the keyframe offsets traces the CSS animation exactly. One timing
// rather than a sequence of them: a sequence starts each step a frame after the last one ends,
// which would leave the flight a frame behind per keyframe.
function keyframeEasing(keyframes: readonly Timed[]) {
  const gaps = keyframes.slice(1).map((next, index) => {
    const from = keyframes[index];
    const [x1, y1, x2, y2] = from.easing;
    return { from: from.at, to: next.at, curve: Easing.bezier(x1, y1, x2, y2) };
  });
  return (time: number) => {
    const gap = gaps.find(({ to }) => time <= to) ?? gaps[gaps.length - 1];
    const span = gap.to - gap.from;
    return span > 0 ? gap.from + span * gap.curve((time - gap.from) / span) : gap.to;
  };
}

export function keyframeTimeline(
  progress: Animated.Value,
  keyframes: readonly Timed[],
  durationMs: number,
  delayMs = 0
) {
  return Animated.timing(progress, {
    toValue: 1,
    duration: durationMs,
    ...(delayMs > 0 ? { delay: delayMs } : {}),
    easing: keyframeEasing(keyframes),
    useNativeDriver: true,
  });
}

export function keyframeValue<K extends Readonly<{ at: number }>>(
  progress: Animated.Value,
  keyframes: readonly K[],
  value: (keyframe: K) => number
) {
  return progress.interpolate({
    inputRange: keyframes.map((keyframe) => keyframe.at),
    outputRange: keyframes.map(value),
    extrapolate: 'clamp',
  });
}

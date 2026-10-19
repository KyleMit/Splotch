import { useLayoutEffect, useRef } from 'react';
import { I18nManager } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { html } from 'react-strict-dom';
import { useReduceMotion } from '../drawing/useReduceMotion';
import {
  EASE_GLIDE,
  THUMB_TRAVEL_MS,
  thumbLayout,
  thumbOrigin,
  thumbStyles,
  type SegmentThumbProps,
} from './segmentThumbFace';

function travelTo(value: SharedValue<number>, target: number, travel: boolean) {
  value.value = travel
    ? withTiming(target, {
        duration: THUMB_TRAVEL_MS,
        easing: Easing.bezier(...EASE_GLIDE),
        reduceMotion: ReduceMotion.Never,
      })
    : target;
}

// The segment skin's one raised thumb travels between cells instead of each cell painting its own
// fill. It is measured rather than computed from the index because cells are equal-width only
// under `fill`. It glides on the UI thread when the selection moves and snaps on first placement,
// on a resize and under reduced motion, so a travel never renders React. The web export slides it
// by a CSS transition instead (segmentThumb.web.tsx).
export function SegmentThumb({ cell, index, stacked }: SegmentThumbProps) {
  return stacked ? (
    <StackedThumb key="stacked" cell={cell} index={index} />
  ) : (
    <RowThumb key="row" cell={cell} index={index} />
  );
}

function RowThumb({ cell, index }: Omit<SegmentThumbProps, 'stacked'>) {
  const reduced = useReduceMotion();
  const x = useSharedValue(cell.x);
  const width = useSharedValue(cell.width);
  const placed = useRef(index);
  useLayoutEffect(() => {
    const travel = placed.current !== index && !reduced;
    placed.current = index;
    travelTo(x, cell.x, travel);
    travelTo(width, cell.width, travel);
  }, [cell.x, cell.width, index, reduced, x, width]);
  const frame = useAnimatedStyle(() => ({
    width: width.value,
    transform: [{ translateX: x.value }],
  }));
  return (
    <Animated.View aria-hidden style={[thumbLayout.frame, thumbOrigin(I18nManager), frame]}>
      <html.div style={thumbStyles.face} />
    </Animated.View>
  );
}

// The stacked track's thumb spans the track's width and glides between rows.
function StackedThumb({ cell, index }: Omit<SegmentThumbProps, 'stacked'>) {
  const reduced = useReduceMotion();
  const y = useSharedValue(cell.y);
  const height = useSharedValue(cell.height);
  const placed = useRef(index);
  useLayoutEffect(() => {
    const travel = placed.current !== index && !reduced;
    placed.current = index;
    travelTo(y, cell.y, travel);
    travelTo(height, cell.height, travel);
  }, [cell.y, cell.height, index, reduced, y, height]);
  const frame = useAnimatedStyle(() => ({
    height: height.value,
    transform: [{ translateY: y.value }],
  }));
  return (
    <Animated.View aria-hidden style={[thumbLayout.stackedFrame, frame]}>
      <html.div style={[thumbStyles.face, thumbStyles.stackedFace]} />
    </Animated.View>
  );
}

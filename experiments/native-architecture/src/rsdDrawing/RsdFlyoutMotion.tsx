import { useEffect, useRef, type ReactNode } from 'react';
import { html } from 'react-strict-dom';
import { Animated } from '../platform/animated';
import { useReduceMotion } from '../drawing/useReduceMotion';
import { FLYOUT_EXIT_MS } from '../../../../web/src/lib/motionDurations';
import {
  FLYOUT_EXIT_DROP_PX,
  FLYOUT_EXIT_SCALE,
  flyoutExitEase,
} from '../../../../web/src/lib/components/flyoutMotion';
import { keyframeTimeline, keyframeValue } from './keyframeMotion';

import {
  FLYOUT_ENTER_MS,
  FLYOUT_ENTER_POSE_KEYFRAMES,
  FLYOUT_ENTER_FADE_KEYFRAMES,
  FLYOUT_OPTION_ENTER_MS,
  FLYOUT_OPTION_DELAY_MS,
  FLYOUT_OPTION_STAGGER_MS,
  FLYOUT_OPTION_KEYFRAMES,
} from './flyoutKeyframes';

export type FlyoutMotionProps = {
  visible: boolean;
  onExited: () => void;
  motionless: boolean;
  portrait: boolean;
  originX: number;
};

function useFlyoutMotion({ visible, onExited, motionless }: FlyoutMotionProps) {
  const reduced = useReduceMotion();
  const fade = useRef(new Animated.Value(0)).current;
  const pose = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!visible) {
      if (motionless || reduced) {
        onExited();
        return;
      }
      const leave = Animated.timing(exit, {
        toValue: 0,
        duration: FLYOUT_EXIT_MS,
        easing: flyoutExitEase,
        useNativeDriver: true,
      });
      let cancelled = false;
      leave.start(({ finished }) => {
        if (finished && !cancelled) onExited();
      });
      return () => {
        cancelled = true;
        leave.stop();
      };
    }
    exit.setValue(1);
    if (motionless || reduced) {
      fade.setValue(1);
      pose.setValue(1);
      return;
    }
    fade.setValue(0);
    pose.setValue(0);
    const enter = Animated.parallel([
      keyframeTimeline(fade, FLYOUT_ENTER_FADE_KEYFRAMES, FLYOUT_ENTER_MS),
      keyframeTimeline(pose, FLYOUT_ENTER_POSE_KEYFRAMES, FLYOUT_ENTER_MS),
    ]);
    enter.start();
    return () => enter.stop();
  }, [visible, motionless, reduced, onExited, fade, pose, exit]);
  return { fade, pose, exit };
}

export function RsdFlyoutMotion({
  children,
  ...props
}: FlyoutMotionProps & { children: ReactNode }) {
  const { fade, pose, exit } = useFlyoutMotion(props);
  const enterOffset = keyframeValue(pose, FLYOUT_ENTER_POSE_KEYFRAMES, (frame) => frame.offsetPx);
  const scale = keyframeValue(pose, FLYOUT_ENTER_POSE_KEYFRAMES, (frame) => frame.scale);
  const opacity = keyframeValue(fade, FLYOUT_ENTER_FADE_KEYFRAMES, (frame) => frame.opacity);
  const exitDrop = exit.interpolate({ inputRange: [0, 1], outputRange: [FLYOUT_EXIT_DROP_PX, 0] });
  const exitScale = exit.interpolate({ inputRange: [0, 1], outputRange: [FLYOUT_EXIT_SCALE, 1] });
  return (
    <Animated.View
      testID="rsd-flyout-motion"
      pointerEvents={props.visible ? 'box-none' : 'none'}
      accessibilityElementsHidden={!props.visible}
      importantForAccessibility={props.visible ? 'auto' : 'no-hide-descendants'}
      style={{
        opacity: Animated.multiply(opacity, exit),
        transformOrigin: [props.originX, '100%', 0],
        transform: [
          { translateX: props.portrait ? Animated.multiply(enterOffset, -1) : 0 },
          { translateY: Animated.add(props.portrait ? 0 : enterOffset, exitDrop) },
          { scale: Animated.multiply(scale, exitScale) },
        ],
      }}
    >
      <html.div inert={!props.visible}>{children}</html.div>
    </Animated.View>
  );
}

export function RsdFlyoutOption({
  visible,
  motionless,
  index,
  children,
}: Pick<FlyoutMotionProps, 'visible' | 'motionless'> & { index: number; children: ReactNode }) {
  const reduced = useReduceMotion();
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return;
    if (motionless || reduced) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const enter = keyframeTimeline(
      progress,
      FLYOUT_OPTION_KEYFRAMES,
      FLYOUT_OPTION_ENTER_MS,
      FLYOUT_OPTION_DELAY_MS + index * FLYOUT_OPTION_STAGGER_MS
    );
    enter.start();
    return () => enter.stop();
  }, [visible, motionless, reduced, index, progress]);
  const rotate = keyframeValue(
    progress,
    FLYOUT_OPTION_KEYFRAMES,
    (frame) => frame.rotate
  ).interpolate({ inputRange: [0, 1], outputRange: ['0deg', '1deg'] });
  return (
    <Animated.View
      testID="rsd-flyout-option-motion"
      style={{
        opacity: keyframeValue(progress, FLYOUT_OPTION_KEYFRAMES, (frame) => frame.opacity),
        transform: [
          { translateY: keyframeValue(progress, FLYOUT_OPTION_KEYFRAMES, (frame) => frame.y) },
          { rotate },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Animated, Easing } from '../platform/animated';
import type { ClearDock } from '../clear/clearDock';
import { COACHMARK_LOOP_MS, GHOST_TRAVEL_OVERSHOOT } from '../clear/dragToClear';
import { RsdClearFace } from './RsdClearFace';
import { RsdClearRing, ringFrame, type RingInk } from './RsdClearRing';
import { RsdIcon } from './RsdIcon';

// ClearCoachmark.svelte's container fade, in both directions and under reduced motion alike.
const COACHMARK_FADE_MS = 400;
const HAND_SIZE_PX = 52;
const REDUCED_GHOST_OPACITY = 0.95;
// The coachmark's friendlier coral while inviting, settling to the rose "ready" ring as the ghost
// lands past the threshold.
const HINT_RING: RingInk = {
  rgb: 'rgb(255, 107, 107)',
  strokeOpacity: 0.4,
  washOpacity: 0.05,
  washFrom: 0.6,
  solid: false,
};
const READY_RING: RingInk = {
  rgb: 'rgb(238, 90, 111)',
  strokeOpacity: 0.85,
  washOpacity: 0.18,
  washFrom: 0.5,
  solid: true,
};
const SEGMENT = Easing.inOut(Easing.ease);

// The coachmarkDrag and coachmarkRing keyframes, stop for stop.
const GHOST_STOPS = [0, 0.08, 0.16, 0.58, 0.7, 0.8, 0.9, 1];
const GHOST_TRAVEL = [0, 0, 0, 1, 1, 1, 1, 1];
const GHOST_SCALE = [1, 1, 0.94, 0.94, 0.94, 1.05, 1.08, 1];
const GHOST_OPACITY = [0, 1, 1, 1, 1, 1, 0, 0];
const RING_STOPS = [0, 0.08, 0.18, 0.57, 0.63, 0.64, 0.7, 0.86, 0.94, 1];
const RING_SCALE = [0.9, 0.9, 1, 1, 1, 1, 1.015, 1.015, 1.015, 1.015];
const HINT_OPACITY = [0, 0, 1, 1, 1, 0, 0, 0, 0, 0];
const READY_OPACITY = [0, 0, 0, 0, 0, 1, 1, 1, 0, 0];

const coach = StyleSheet.create({
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  hand: { position: 'absolute', left: '58%', top: '52%' },
});

// The ghost starts exactly over the docked Clear Button.
function ghostFrame(dock: ClearDock) {
  return {
    position: 'absolute',
    top: dock.top,
    right: dock.right,
    width: dock.size,
    height: dock.size,
  } as const;
}

function track(clock: Animated.Value, stops: number[], values: number[]) {
  return clock.interpolate({ inputRange: stops, outputRange: values, easing: SEGMENT });
}

function useFadedPresence(visible: boolean) {
  const [opacity] = useState(() => new Animated.Value(0));
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  useEffect(() => {
    const animation = Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: COACHMARK_FADE_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => animation.stop();
  }, [opacity, visible]);
  return { opacity, mounted };
}

// A ghost of the Clear button peels off the real one and mimes the drag past the accept ring,
// looping until a drag, a commit, a layout change or six seconds dismisses it. Under reduced
// motion it holds the one frame that says the same thing. Like the shipping coachmark it is
// wordless and hidden from assistive technology, which clears through the button's activation.
export function RsdClearCoachmark({
  visible,
  radius,
  reduced,
  dock,
}: {
  visible: boolean;
  radius: number;
  reduced: boolean;
  dock: ClearDock;
}) {
  const { opacity, mounted } = useFadedPresence(visible);
  const [clock] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!mounted || reduced) return;
    clock.setValue(0);
    const loop = Animated.loop(
      Animated.timing(clock, {
        toValue: 1,
        duration: COACHMARK_LOOP_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [clock, mounted, reduced]);
  if (!mounted) return null;
  const travel = (radius * GHOST_TRAVEL_OVERSHOOT) / Math.SQRT2;
  const along = reduced ? null : track(clock, GHOST_STOPS, GHOST_TRAVEL);
  const ringScale = reduced ? 1 : track(clock, RING_STOPS, RING_SCALE);
  return (
    <Animated.View
      testID="rsd-clear-coachmark"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      style={[coach.fill, { opacity }]}
    >
      {reduced ? null : (
        <Animated.View
          style={[
            ringFrame(radius, dock),
            { opacity: track(clock, RING_STOPS, HINT_OPACITY), transform: [{ scale: ringScale }] },
          ]}
        >
          <RsdClearRing radius={radius} ink={HINT_RING} id="rsd-coachmark-hint" />
        </Animated.View>
      )}
      <Animated.View
        style={[
          ringFrame(radius, dock),
          {
            opacity: reduced ? 1 : track(clock, RING_STOPS, READY_OPACITY),
            transform: [{ scale: ringScale }],
          },
        ]}
      >
        <RsdClearRing radius={radius} ink={READY_RING} id="rsd-coachmark-ready" />
      </Animated.View>
      <Animated.View
        testID="rsd-clear-coachmark-ghost"
        style={[
          ghostFrame(dock),
          {
            opacity: reduced ? REDUCED_GHOST_OPACITY : track(clock, GHOST_STOPS, GHOST_OPACITY),
            transform: [
              { translateX: along ? Animated.multiply(along, -travel) : -travel },
              { translateY: along ? Animated.multiply(along, travel) : travel },
              { scale: reduced ? 1 : track(clock, GHOST_STOPS, GHOST_SCALE) },
            ],
          },
        ]}
      >
        <RsdClearFace dock={dock} state="ghost" disabled={false} />
        <View style={coach.hand}>
          <RsdIcon name="swipe-down" size={HAND_SIZE_PX} ink={undefined} muted={false} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

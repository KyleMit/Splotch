import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { html } from 'react-strict-dom';
import { Animated, Easing } from '../platform/animated';
import { useReduceMotion } from '../drawing/useReduceMotion';
import { CALM_FADE_MS, SECTION_SLIDE_MS } from '../../../../web/src/lib/motionDurations';
import { useModalPresence } from './useModalPresence';

const SLIDE_OPACITY_RAMP = 20;
const CONTENT_LAYOUT = { flexShrink: 0 };

// Svelte's slide clips natural-size content while its height and margins grow; layout properties
// require Animated's JS driver. Keeping one driver also lets the same value reverse when the
// parent changes the motion preference; Animated values cannot switch away from the native driver.
export function RsdSectionReveal({
  visible,
  marginTop = 0,
  marginBottom = 0,
  children,
}: {
  visible: boolean;
  marginTop?: number;
  marginBottom?: number;
  children: ReactNode;
}) {
  const reduced = useReduceMotion();
  const [request, setRequest] = useState({ visible, reduced, initial: true });
  if (request.visible !== visible) setRequest({ visible, reduced, initial: false });
  const { shown, dismissed } = useModalPresence(visible ? true : null);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [height, setHeight] = useState<number | null>(null);
  const [completed, setCompleted] = useState(request);
  const measured = height !== null;
  useLayoutEffect(() => {
    if (request.initial || completed === request) return;
    if (!request.reduced && !measured) {
      if (!request.visible) {
        progress.setValue(0);
        dismissed();
      }
      return;
    }
    const transition = Animated.timing(progress, {
      toValue: request.visible ? 1 : 0,
      duration: request.reduced ? CALM_FADE_MS : SECTION_SLIDE_MS,
      easing: request.reduced ? Easing.linear : Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    let active = true;
    transition.start(({ finished }) => {
      if (!finished || !active) return;
      setCompleted(request);
      if (!request.visible) {
        dismissed();
        setHeight(null);
      }
    });
    return () => {
      active = false;
      transition.stop();
    };
  }, [request, completed, measured, progress, dismissed]);
  if (shown === null) return null;
  const sliding = completed !== request && !request.reduced;
  const extent = (pixels: number) =>
    sliding ? progress.interpolate({ inputRange: [0, 1], outputRange: [0, pixels] }) : pixels;
  return (
    <Animated.View
      testID="settings-section-reveal"
      pointerEvents={visible ? 'box-none' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={{
        overflow: sliding ? 'hidden' : 'visible',
        minHeight: 0,
        height: sliding ? (height === null ? 0 : extent(height)) : undefined,
        marginTop: extent(marginTop),
        marginBottom: extent(marginBottom),
        opacity: request.reduced
          ? progress
          : progress.interpolate({
              inputRange: [0, 1 / SLIDE_OPACITY_RAMP, 1],
              outputRange: [0, 1, 1],
              extrapolate: 'clamp',
            }),
      }}
    >
      <View
        testID="settings-section-reveal-body"
        style={CONTENT_LAYOUT}
        onLayout={({ nativeEvent }) => setHeight(nativeEvent.layout.height)}
      >
        <html.div inert={!visible}>{children}</html.div>
      </View>
    </Animated.View>
  );
}

import { useEffect, type ReactNode } from 'react';
import { I18nManager, Pressable, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { html } from 'react-strict-dom';
import { DRAWING_SCALE } from '../drawing/theme';
import { useReduceMotion } from '../drawing/useReduceMotion';
import {
  SWITCH_SLIDE_PX,
  SwitchThumbFace,
  SwitchTrack,
  switchStyles,
  type ToggleSwitchProps,
} from './toggleSwitchFace';

const MS_PER_SECOND = 1000;
const THUMB_SLIDE_MS = DRAWING_SCALE.durationBase * MS_PER_SECOND;
// CSS's `ease` keyword, the shipping thumb's timing function.
const CSS_EASE = Easing.bezier(0.25, 0.1, 0.25, 1);

// The thumb's origin follows React Native's RTL swap (its `left` inset lands on the trailing
// edge), but a translation stays physical, so in a swapped RTL layout the slide runs leftward.
function slideDestination(checked: boolean) {
  if (!checked) return 0;
  const mirrored = I18nManager.isRTL && I18nManager.doLeftAndRightSwapInRTL;
  return mirrored ? -SWITCH_SLIDE_PX : SWITCH_SLIDE_PX;
}

// The thumb slides on the UI thread, so a toggle renders React once rather than per frame.
// Reduced motion is the app's own answer (the parent's choice over the device's), so
// Reanimated's system-setting shortcut must not decide it instead.
function useThumbSlide(checked: boolean) {
  const reduced = useReduceMotion();
  const destination = slideDestination(checked);
  const offset = useSharedValue(destination);
  useEffect(() => {
    offset.value = withTiming(destination, {
      duration: reduced ? 0 : THUMB_SLIDE_MS,
      easing: CSS_EASE,
      reduceMotion: ReduceMotion.Never,
    });
  }, [destination, reduced, offset]);
  return useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
}

// The shipping ToggleSwitch.svelte on Android and iOS. React Native's own pressable carries the
// switch semantics, because the help line reaches a screen reader only as an accessibility hint,
// which React Strict DOM cannot express.
export function RsdToggleSwitch({
  id,
  label,
  checked,
  onToggle,
  description,
  disabled = false,
  thumbIcon,
}: ToggleSwitchProps) {
  const thumb = useThumbSlide(checked);
  return (
    <html.div style={[switchStyles.hitArea, disabled && switchStyles.inert]}>
      <Pressable
        nativeID={id}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityHint={description?.text}
        accessibilityState={{ checked, disabled }}
        disabled={disabled}
        onPress={() => onToggle(!checked)}
        style={StyleSheet.absoluteFill}
      >
        <SwitchTrack checked={checked} hovered={false} />
        <html.div style={switchStyles.thumbSlot}>
          <Animated.View testID="toggle-switch-slide" style={thumb}>
            <SwitchThumbFace thumbIcon={thumbIcon} />
          </Animated.View>
        </html.div>
      </Pressable>
    </html.div>
  );
}

// The row's icon and label toggle the switch, as the shipping <label for> does. The switch
// already carries the label as its name, so this half stays out of the accessibility tree.
export function RsdSwitchLabel({
  checked,
  disabled,
  onToggle,
  children,
}: {
  id: string;
  checked: boolean;
  disabled: boolean;
  onToggle: (next: boolean) => void;
  children: ReactNode;
}) {
  return (
    <html.div
      aria-hidden
      style={[switchStyles.label, disabled && switchStyles.labelInert]}
      onClick={disabled ? undefined : () => onToggle(!checked)}
    >
      {children}
    </html.div>
  );
}

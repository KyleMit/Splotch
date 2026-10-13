import type { ComponentProps } from 'react';
import { Pressable, type PressableProps } from 'react-native';
import { Animated } from '../platform/animated';
import { compat, type html } from 'react-strict-dom';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// The props the released renderer resolves for a host: its :active state handlers, and whether
// a style transition made the style animated.
type ResolvedProps = PressableProps & {
  animated?: boolean;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
  onPointerCancel?: () => void;
};

// The renderer's :active state follows raw pointer down and up, and React Native sends pointer
// up to whatever is under the finger at release, so a press that slides off and lifts elsewhere
// stays pressed. Pressable's own press lifecycle drives that state instead: press-out fires on
// sliding off, on cancellation and on release, and press-in again on sliding back. A native
// host has no form to submit, so the button's type is dropped. The host renders as a div, which
// carries no implicit role natively, so a caller that names none gets the button role a web
// <button> implies.
export function RsdPressable({
  children,
  type: _formType,
  role = 'button',
  ...props
}: ComponentProps<typeof html.button>) {
  return (
    <compat.native<ResolvedProps> {...props} role={role} as="div">
      {({ animated, onPointerDown, onPointerUp, onPointerCancel, ...resolved }) => {
        const Host = animated ? AnimatedPressable : Pressable;
        return (
          <Host {...resolved} onPressIn={onPointerDown} onPressOut={onPointerUp ?? onPointerCancel}>
            {children}
          </Host>
        );
      }}
    </compat.native>
  );
}

import {
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type Ref,
} from 'react';
import { Pressable, type PressableProps, type View } from 'react-native';
import { Animated } from '../platform/animated';
import { compat, type html } from 'react-strict-dom';
import { InertRegion } from './toolbarSkin';
import { createSecondTouchPress, nativePressFrame, useSecondTouchTarget } from './secondTouchPress';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// The props the released renderer resolves for a host: its :active state handlers, and whether
// a style transition made the style animated.
type ResolvedProps = PressableProps & {
  ref?: Ref<View>;
  animated?: boolean;
  onPressBegin?: () => void;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
  onPointerCancel?: () => void;
};

function NativePressable({
  animated,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onPressBegin,
  ref: forwarded,
  children,
  ...resolved
}: ResolvedProps & { children: ReactNode }) {
  const host = useRef<View | null>(null);
  const mounted = useRef(true);
  const current = useRef({ resolved, onPointerDown, onPointerUp, onPointerCancel, onPressBegin });
  current.current = { resolved, onPointerDown, onPointerUp, onPointerCancel, onPressBegin };
  const ref = useCallback(
    (node: View | null) => {
      host.current = node;
      if (typeof forwarded === 'function') forwarded(node);
      else if (forwarded) forwarded.current = node;
    },
    [forwarded]
  );
  const beginPress = () => {
    if (mounted.current && !current.current.resolved.disabled) current.current.onPressBegin?.();
    current.current.onPointerDown?.();
  };
  const [secondary] = useState(() =>
    createSecondTouchPress({
      enabled: () =>
        mounted.current &&
        !current.current.resolved.disabled &&
        current.current.resolved.onPress != null,
      measure(complete) {
        const view = host.current;
        if (!view) {
          complete(null);
          return;
        }
        view.measureInWindow((x, y, width, height) => {
          complete(
            [x, y, width, height].every(Number.isFinite) && width > 0 && height > 0
              ? { x, y, width, height }
              : null
          );
        });
      },
      pressIn: beginPress,
      pressOut: () => (current.current.onPointerUp ?? current.current.onPointerCancel)?.(),
      press: (event) => current.current.resolved.onPress?.(event),
    })
  );
  const [target] = useState(() => ({
    ...secondary,
    bounds: () =>
      mounted.current && !current.current.resolved.disabled && current.current.resolved.onPress
        ? nativePressFrame(host.current)
        : null,
    priority: 'control' as const,
  }));
  useSecondTouchTarget(target);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      secondary.cancel();
    };
  }, [secondary]);
  useLayoutEffect(() => {
    if (resolved.disabled || !resolved.onPress) secondary.cancel();
  }, [secondary, resolved.disabled, resolved.onPress]);
  const Host = animated ? AnimatedPressable : Pressable;
  return (
    <Host
      {...resolved}
      ref={ref}
      onPress={secondary.press}
      onPressIn={beginPress}
      onPressOut={onPointerUp ?? onPointerCancel}
      onTouchStart={(event) => {
        resolved.onTouchStart?.(event);
        secondary.start(event);
      }}
      onTouchMove={(event) => {
        resolved.onTouchMove?.(event);
        secondary.move(event);
      }}
      onTouchEnd={(event) => {
        resolved.onTouchEnd?.(event);
        secondary.end(event);
      }}
      onTouchCancel={(event) => {
        resolved.onTouchCancel?.(event);
        secondary.cancel();
      }}
    >
      {children}
    </Host>
  );
}

// The renderer's :active state follows raw pointer down and up, and React Native sends pointer
// up to whatever is under the finger at release, so a press that slides off and lifts elsewhere
// stays pressed. Pressable's own press lifecycle drives that state instead: press-out fires on
// sliding off, on cancellation and on release, and press-in again on sliding back. A native
// host has no form to submit, so the button's type is dropped. The host renders as a div, which
// carries no implicit role natively, so a caller that names none gets the button role a web
// <button> implies. Inside an inert region the press is dropped (InertRegion).
export function RsdPressable({
  children,
  type: _formType,
  role = 'button',
  onClick,
  onPressBegin,
  ...props
}: ComponentProps<typeof html.button> & { onPressBegin?: () => void }) {
  const inert = useContext(InertRegion);
  return (
    <compat.native<ResolvedProps>
      {...props}
      onClick={inert ? undefined : onClick}
      role={role}
      as="div"
    >
      {(resolved) => (
        <NativePressable {...resolved} onPressBegin={inert ? undefined : onPressBegin}>
          {children}
        </NativePressable>
      )}
    </compat.native>
  );
}

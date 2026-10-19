import { useLayoutEffect, useRef } from 'react';
import { StyleSheet, View, type GestureResponderEvent, type ViewInstance } from 'react-native';
import { PRESS_CLICK_CONSUME_WINDOW_MS } from '../../../../web/src/lib/actions/clickConsumeWindow';
import { DRAWING_SCALE } from '../drawing/theme';
import { useReduceMotion } from '../drawing/useReduceMotion';
import { Animated, Easing } from '../platform/animated';
import { RsdIconButton } from './RsdIconButton';
import type { EdgeOffset } from './edgeLayout';
import { inkKeyline } from './inkKeyline';
import { EASE_GLIDE } from './modalGeometry';

// ColorControl.svelte's loaded-ink splotch and colorFoldGesture.ts's tap travel, which no shipping
// module exports; rsd-native-color-control.test.mjs reads both sources and fails on divergence.
export const COLOR_ICON_PX = 34;
export const FOLD_TAP_TRAVEL_PX = 18;

const MS_PER_SECOND = 1000;
const GLIDE_MS = DRAWING_SCALE.durationBase * MS_PER_SECOND;

const docks = StyleSheet.create({ slot: { position: 'absolute' } });

type Start = { x: number; y: number };

// A vertical swipe on the button folds the drawer, as shipping's colorFoldGesture does: down puts
// the open drawer away, up brings the closed one out. A tap stays the button's own press.
function useFoldGesture(drawerOpen: boolean, foldable: boolean, onFold: () => void) {
  const start = useRef<Start | null>(null);
  const swipedAt = useRef(-Infinity);
  const travel = ({ nativeEvent }: GestureResponderEvent) => {
    const from = start.current ?? { x: nativeEvent.pageX, y: nativeEvent.pageY };
    return { dx: nativeEvent.pageX - from.x, dy: nativeEvent.pageY - from.y };
  };
  return {
    // A swipe's release can still reach the button as a click on the web; it is not a tap.
    tapAllowed: () => Date.now() - swipedAt.current >= PRESS_CLICK_CONSUME_WINDOW_MS,
    handlers: {
      onStartShouldSetResponderCapture(event: GestureResponderEvent) {
        start.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
        return false;
      },
      onMoveShouldSetResponderCapture(event: GestureResponderEvent) {
        if (!foldable) return false;
        const { dx, dy } = travel(event);
        return Math.abs(dy) >= FOLD_TAP_TRAVEL_PX && Math.abs(dy) > Math.abs(dx);
      },
      onResponderTerminationRequest: () => false,
      onResponderRelease(event: GestureResponderEvent) {
        swipedAt.current = Date.now();
        const folded = travel(event).dy > 0;
        if (drawerOpen === folded) onFold();
      },
    },
  };
}

// The slot glides between its places as the drawer opens and closes, as shipping eases the
// wrapper's bottom over --duration-base on --ease-glide.
function useGlide(bottom: number) {
  const reduced = useReduceMotion();
  const offset = useRef(new Animated.Value(0)).current;
  const previous = useRef(bottom);
  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = bottom;
    if (from === bottom || reduced) return;
    offset.setValue(bottom - from);
    const glide = Animated.timing(offset, {
      toValue: 0,
      duration: GLIDE_MS,
      easing: Easing.bezier(...EASE_GLIDE),
      useNativeDriver: true,
    });
    glide.start();
    return () => glide.stop();
  }, [bottom, reduced, offset]);
  return offset;
}

// The shipping Color Button: on a landscape phone, the loaded ink as a splotch on an action tile,
// opening the Color Menu beside it.
export function RsdColorButton({
  place,
  size,
  ink,
  expanded,
  dimmed,
  disabled,
  drawerOpen,
  foldable,
  slotRef,
  onCapture,
  onToggle,
  onFold,
}: {
  place: EdgeOffset;
  size: number;
  ink: string;
  expanded: boolean;
  dimmed: boolean;
  disabled: boolean;
  drawerOpen: boolean;
  // Folding needs a drawer with something in it.
  foldable: boolean;
  slotRef: (node: ViewInstance | null) => void;
  onCapture: (() => boolean) | undefined;
  onToggle: () => void;
  onFold: () => void;
}) {
  const fold = useFoldGesture(drawerOpen, foldable && !disabled, onFold);
  const offset = useGlide(place.bottom);
  return (
    <View
      ref={slotRef}
      testID="rsd-color-button-slot"
      style={[docks.slot, place]}
      {...fold.handlers}
      onStartShouldSetResponderCapture={(event) => {
        fold.handlers.onStartShouldSetResponderCapture(event);
        return onCapture?.() ?? false;
      }}
    >
      <Animated.View style={{ transform: [{ translateY: offset }] }}>
        <RsdIconButton
          skin="tile"
          size={size}
          iconPx={COLOR_ICON_PX}
          icon="ink-splotch"
          label="Colors"
          ink={ink}
          keyline={inkKeyline(ink)}
          expanded={expanded}
          dimmed={dimmed}
          disabled={disabled}
          onPress={() => {
            if (fold.tapAllowed()) onToggle();
          }}
        />
      </Animated.View>
    </View>
  );
}

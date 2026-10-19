import { StyleSheet, View, type ViewInstance } from 'react-native';
import { useRef, useState } from 'react';
import { Animated } from '../platform/animated';
import type { ClearDock } from '../clear/clearDock';
import type { ClearControl } from '../clear/useClearGesture';
import { clearActivationProps } from '../platform/clearActivation';
import { focusRingHostView } from './focusRing';
import { ACCEPT_RING, RsdClearRing, ringFrame } from './RsdClearRing';
import { RsdClearCoachmark } from './clearSurfaces';
import { RsdClearFace } from './RsdClearFace';
import { nativePressFrame, useSecondTouchTarget } from './secondTouchPress';

const DELETE_READY_SCALE = 1.1;
const LIFT_SQUASH = 0.07;
const RING_REVEAL_FROM_SCALE = 0.85;
function dockFrame(dock: ClearDock) {
  return { position: 'absolute', top: dock.top, right: dock.right } as const;
}
// Shipping's accept ring sits under the Notch Band (--z-clear-accept-zone), so it stays inside the
// safe-area frame while the button and coachmark, over the band, may reach a side inset.
const frameClip = StyleSheet.create({
  ring: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
});

// The Clear Button docks as a red half-disc tab against the screen's right edge; a drag lifts it
// into a full disc that follows the finger, and past the accept ring it turns alarm red and glows.
function RsdClearButton({ control, disabled }: { control: ClearControl; disabled: boolean }) {
  const { values, dragging, reached, clearing, dock } = control;
  const host = useRef<ViewInstance | null>(null);
  const current = useRef({ control, disabled });
  current.current = { control, disabled };
  const [target] = useState(() => ({
    bounds: () =>
      current.current.disabled || current.current.control.clearing
        ? null
        : nativePressFrame(host.current),
    start: (event: Parameters<typeof control.responder.onTouchStart>[0], identifier: string) =>
      current.current.control.responder.onTouchStart(event, identifier),
    move: (event: Parameters<typeof control.responder.onTouchMove>[0]) =>
      current.current.control.responder.onTouchMove(event),
    end: (event: Parameters<typeof control.responder.onTouchEnd>[0]) =>
      current.current.control.responder.onTouchEnd(event),
    cancel: () => current.current.control.responder.onTouchCancel(),
    priority: 'clear' as const,
  }));
  useSecondTouchTarget(target);
  return (
    <Animated.View
      ref={host}
      accessible
      accessibilityRole="button"
      accessibilityLabel="Clear drawing"
      accessibilityState={{ disabled }}
      pointerEvents={clearing ? 'none' : 'auto'}
      {...control.responder}
      {...clearActivationProps(control.activate)}
      {...focusRingHostView('part')}
      style={{
        width: dock.size,
        height: dock.size,
        transform: [
          { translateX: values.drag.x },
          { translateY: values.drag.y },
          {
            scale: values.emphasis.interpolate({
              inputRange: [0, 1],
              outputRange: [1, DELETE_READY_SCALE],
            }),
          },
          {
            scaleX: Animated.add(values.lift, Animated.multiply(values.liftReturn, -1)).interpolate(
              {
                inputRange: [0, 1],
                outputRange: [1, 1 + LIFT_SQUASH],
              }
            ),
          },
          {
            scaleY: Animated.add(values.lift, Animated.multiply(values.liftReturn, -1)).interpolate(
              {
                inputRange: [0, 1],
                outputRange: [1, 1 - LIFT_SQUASH],
              }
            ),
          },
        ],
      }}
    >
      <RsdClearFace
        dock={dock}
        state={!dragging ? 'docked' : reached ? 'deleteReady' : 'lifted'}
        disabled={disabled}
      />
    </Animated.View>
  );
}

// Everything the gesture paints over the edge controls, in the whole layout's coordinates as the
// shipping fixed layers are: the accept ring, the docked button and the coachmark, in that order.
export function RsdClearOverlay({
  control,
  disabled,
}: {
  control: ClearControl;
  disabled: boolean;
}) {
  const { values, reached, radius, dock } = control;
  return (
    <>
      {control.ringShown ? (
        <View testID="rsd-clear-ring-clip" pointerEvents="none" style={frameClip.ring}>
          <Animated.View
            testID="rsd-clear-accept-ring"
            pointerEvents="none"
            style={[
              ringFrame(radius, dock),
              {
                opacity: values.ring.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1],
                  extrapolate: 'clamp',
                }),
                transform: [
                  {
                    scale: values.ringScale.interpolate({
                      inputRange: [0, 1],
                      outputRange: [RING_REVEAL_FROM_SCALE, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <RsdClearRing
              radius={radius}
              ink={reached ? ACCEPT_RING.reached : ACCEPT_RING.short}
              id="rsd-clear-accept"
            />
          </Animated.View>
        </View>
      ) : null}
      <View testID="rsd-clear-dock" pointerEvents="box-none" style={dockFrame(dock)}>
        <RsdClearButton control={control} disabled={disabled} />
      </View>
      <RsdClearCoachmark
        visible={control.coachmark}
        radius={radius}
        reduced={control.reduced}
        dock={dock}
      />
    </>
  );
}

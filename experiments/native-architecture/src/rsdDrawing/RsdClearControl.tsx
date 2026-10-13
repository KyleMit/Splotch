import { Animated, View } from 'react-native';
import type { ClearDock } from '../clear/clearDock';
import type { ClearControl } from '../clear/useClearGesture';
import { clearActivationProps } from '../platform/clearActivation';
import { ACCEPT_RING, RsdClearRing, ringFrame } from './RsdClearRing';
import { RsdClearCoachmark } from './clearSurfaces';
import { RsdClearFace } from './RsdClearFace';

const DELETE_READY_SCALE = 1.1;
const LIFT_SQUASH = 0.07;
const RING_REVEAL_FROM_SCALE = 0.85;
function dockFrame(dock: ClearDock) {
  return { position: 'absolute', top: dock.top, right: dock.right } as const;
}

// The Clear Button docks as a red half-disc tab against the screen's right edge; a drag lifts it
// into a full disc that follows the finger, and past the accept ring it turns alarm red and glows.
function RsdClearButton({ control, disabled }: { control: ClearControl; disabled: boolean }) {
  const { values, dragging, reached, clearing, dock } = control;
  return (
    <Animated.View
      accessible
      accessibilityRole="button"
      accessibilityLabel="Clear"
      accessibilityState={{ disabled }}
      pointerEvents={clearing ? 'none' : 'auto'}
      {...control.responder}
      {...clearActivationProps(control.activate)}
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
            scaleX: values.lift.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1 + LIFT_SQUASH],
            }),
          },
          {
            scaleY: values.lift.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 1 - LIFT_SQUASH],
            }),
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
                  scale: values.ring.interpolate({
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

import { useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import { Animated } from '../platform/animated';
import {
  BackdropBlur,
  backdropBlurAvailable,
  type BackdropBlurTransition,
} from '../platform/backdropBlur';
import { useReducedTransparency } from '../platform/reducedTransparency';
import {
  CSS_EASE,
  CSS_EASE_REVERSED,
  MODAL_EXIT_MS,
  MODAL_FADE_MS,
  MODAL_SCRIM_BLUR_PX,
  MODAL_SCRIM_FROSTED,
  MODAL_SCRIM_PLAIN,
  type TouchBackdrop,
} from './modalGeometry';

type ModalScrimProps = {
  opacity: Animated.Value;
  visible: boolean;
  seeThrough: boolean;
  touchBackdrop: TouchBackdrop;
};

// The blur arrives and leaves with the scrim's fade, and goes and comes back at once with a
// see-through dialog, as shipping's resizing backdrop drops its filter.
function useBlurTransition(visible: boolean, seeThrough: boolean): BackdropBlurTransition {
  const theme = useDrawingAppearance();
  const [last, setLast] = useState({ visible, seeThrough });
  const [durationMs, setDurationMs] = useState(MODAL_FADE_MS);
  if (last.visible !== visible || last.seeThrough !== seeThrough) {
    setLast({ visible, seeThrough });
    setDurationMs(last.seeThrough !== seeThrough ? 0 : visible ? MODAL_FADE_MS : MODAL_EXIT_MS);
  }
  const shown = visible && !seeThrough;
  return useMemo(
    () => ({
      radius: shown ? MODAL_SCRIM_BLUR_PX : 0,
      durationMs,
      easing: shown ? CSS_EASE : CSS_EASE_REVERSED,
      theme,
    }),
    [shown, durationMs, theme]
  );
}

// The shipping frosted backdrop: a native blur of the screen behind, under the dim the scrim fades.
// Where the device cannot blur, the reader asked for less transparency, or the dialog keeps a
// blur-less backdrop on a touch screen, it takes shipping's plain, deeper dim instead.
export function ModalScrim({ opacity, visible, seeThrough, touchBackdrop }: ModalScrimProps) {
  const plain = useReducedTransparency() || touchBackdrop === 'plain' || !backdropBlurAvailable();
  const blur = useBlurTransition(visible, seeThrough);
  return (
    <>
      {plain ? null : <BackdropBlur blur={blur} />}
      <Animated.View
        testID="modal-scrim"
        pointerEvents="none"
        style={[
          styles.scrim,
          { backgroundColor: plain ? MODAL_SCRIM_PLAIN : MODAL_SCRIM_FROSTED, opacity },
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', inset: 0 },
});

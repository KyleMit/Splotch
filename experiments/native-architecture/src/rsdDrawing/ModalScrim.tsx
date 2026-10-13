import { StyleSheet } from 'react-native';
import { Animated } from '../platform/animated';
import { MODAL_SCRIM_PLAIN } from './modalGeometry';

// Android and iOS have no backdrop blur without a native blur view, so the scrim takes the
// shipping no-blur dim, faded by the dialog's motion.
export function ModalScrim({ opacity }: { opacity: Animated.Value }) {
  return (
    <Animated.View testID="modal-scrim" pointerEvents="none" style={[styles.scrim, { opacity }]} />
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', inset: 0, backgroundColor: MODAL_SCRIM_PLAIN },
});

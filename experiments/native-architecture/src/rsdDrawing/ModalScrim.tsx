import { StyleSheet, View } from 'react-native';
import { MODAL_SCRIM_PLAIN } from './modalGeometry';

// Android and iOS have no backdrop blur without a native blur view, so the scrim takes the
// shipping no-blur dim.
export function ModalScrim() {
  return <View testID="modal-scrim" style={styles.scrim} />;
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', inset: 0, backgroundColor: MODAL_SCRIM_PLAIN },
});

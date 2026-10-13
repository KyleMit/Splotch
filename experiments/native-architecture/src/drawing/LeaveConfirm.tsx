import { View } from 'react-native';
import { Text } from './Text';
import { DrawingModal as Modal } from '../platform/DrawingModal';
import { useLeaveConfirm } from '../platform/BrowserBack';
import { LEAVE_CONFIRM_COPY } from '../product/systemBack';
import { Action } from '../DrawingControls';
import { NativeFrame } from '../rsdDrawing/NativeFrame';
import { useModalAnimation } from './useModalAnimation';
import { useDrawingScreenStyles } from './drawingScreenStyles';

export function LeaveConfirm() {
  const { open, stay, leave } = useLeaveConfirm();
  const animationType = useModalAnimation();
  const styles = useDrawingScreenStyles();
  if (!open) return null;
  // Keep drawing comes first so a stray press or switch-access activation stays.
  return (
    <Modal
      statusBarTranslucent
      navigationBarTranslucent
      visible
      transparent
      animationType={animationType}
      accessibilityLabel={LEAVE_CONFIRM_COPY.title}
      onRequestClose={stay}
    >
      <NativeFrame variant="overlay">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text accessibilityRole="header" style={styles.modalTitle}>
              {LEAVE_CONFIRM_COPY.title}
            </Text>
            <Text style={styles.notice}>{LEAVE_CONFIRM_COPY.body}</Text>
            <Action label={LEAVE_CONFIRM_COPY.stay} primary onPress={stay} />
            <Action label={LEAVE_CONFIRM_COPY.leave} onPress={leave} />
          </View>
        </View>
      </NativeFrame>
    </Modal>
  );
}

import { DrawingModal as Modal } from '../platform/DrawingModal';
import { ScrollView, View } from 'react-native';
import { Animated } from '../platform/animated';
import { Text, TextInput } from '../drawing/Text';
import { Action } from '../DrawingControls';
import { NativeFrame } from '../rsdDrawing/NativeFrame';
import { useDrawingScreenStyles } from '../drawing/drawingScreenStyles';
import { GATE_LABELS } from './parentPolicy';
import type { ParentGateState } from './parentGate';
import { useParentGateMotion } from './useParentGateMotion';
import type { DrawingProductOwner } from '../product/createDrawingProduct';

export function ParentGateSheet({
  owner,
  state,
  visible = state.open,
  onDismiss,
}: {
  owner: DrawingProductOwner;
  state: ParentGateState;
  visible?: boolean;
  onDismiss?: () => void;
}) {
  const styles = useDrawingScreenStyles();
  const offset = useParentGateMotion(state);
  const blocked = state.locked || state.shaking;
  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      accessibilityLabel="Grown-ups only"
      onRequestClose={owner.gate.dismiss}
    >
      <NativeFrame>
        <ScrollView contentContainerStyle={styles.controls} keyboardShouldPersistTaps="handled">
          <Animated.View style={{ transform: [{ translateX: offset }] }}>
            <Text accessibilityRole="header" style={styles.title}>
              Grown-ups only
            </Text>
            <Text style={styles.notice}>{GATE_LABELS[state.feature]}</Text>
            <Text style={styles.title}>
              {state.x} × {state.y}
            </Text>
            <TextInput
              accessibilityLabel="Grown-up answer"
              keyboardType="number-pad"
              value={state.input}
              editable={!blocked}
              onChangeText={owner.gate.input}
              onSubmitEditing={owner.gate.answer}
            />
            <Text accessible={false} importantForAccessibility="no" style={styles.notice}>
              {state.message}
            </Text>
            <Text key={state.announcementId} accessibilityLiveRegion="polite" style={styles.notice}>
              {state.announcement}
            </Text>
            <Action label="Check answer" disabled={blocked} onPress={owner.gate.answer} />
          </Animated.View>
          {state.feature !== 'parentCenter' ? (
            <Action
              label="Manage these checks in Settings › Parent Center"
              onPress={owner.retargetParentCenter}
            />
          ) : null}
          <View>
            <Action label="Cancel challenge" onPress={owner.gate.dismiss} />
          </View>
        </ScrollView>
      </NativeFrame>
    </Modal>
  );
}

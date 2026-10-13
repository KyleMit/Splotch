import { DrawingModal as Modal } from '../platform/DrawingModal';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '../drawing/Text';
import { Action } from '../DrawingControls';
import { NativeFrame } from '../rsdDrawing/NativeFrame';
import { useDrawingScreenStyles } from '../drawing/drawingScreenStyles';
import { PARENT_FEATURES, PARENT_LABELS, PARENT_MODES, PARENT_MODE_LABELS } from './parentPolicy';
import type { DrawingProductOwner } from '../product/createDrawingProduct';

export function ParentCenterSection({
  owner,
  visible,
  onDismiss,
}: {
  owner: DrawingProductOwner;
  visible?: boolean;
  onDismiss?: () => void;
}) {
  const state = owner.getState();
  const settings = state.settings;
  const styles = useDrawingScreenStyles();
  if (!settings) return null;
  const disabled = !owner.settings.canEditParent();
  return (
    <Modal
      visible={visible ?? state.parentCenterOpen}
      onDismiss={onDismiss}
      statusBarTranslucent
      navigationBarTranslucent
      animationType="none"
      accessibilityLabel="Parent Center"
      onRequestClose={owner.closeParentCenter}
    >
      <NativeFrame>
        <ScrollView contentContainerStyle={styles.controls}>
          <Text accessibilityRole="header" style={styles.title}>
            Parent Center
          </Text>
          <Text style={styles.notice}>
            AI picture creation sends a copy of a drawing to the hosted image service only when you
            choose Send. AI starts off. Turning it off keeps saved pictures and credentials.
          </Text>
          <Action
            label={
              settings.aiEnabled ? 'Turn AI picture creation off' : 'Enable AI picture creation'
            }
            disabled={disabled}
            onPress={() => {
              void owner.setAiEnabled(!settings.aiEnabled);
            }}
          />
          {PARENT_FEATURES.map((feature) => (
            <View
              key={feature}
              accessibilityRole="radiogroup"
              accessibilityLabel={PARENT_LABELS[feature]}
            >
              <Text style={styles.notice}>{PARENT_LABELS[feature]}</Text>
              {PARENT_MODES.map((mode) => (
                <Pressable
                  key={mode}
                  accessibilityRole="radio"
                  accessibilityLabel={`${PARENT_MODE_LABELS[mode]}: ${PARENT_LABELS[feature]}`}
                  accessibilityState={{
                    checked: settings.parentPolicies[feature] === mode,
                    disabled,
                  }}
                  style={styles.action}
                  disabled={disabled}
                  onPress={() => {
                    void owner.setPolicy(feature, mode);
                  }}
                >
                  <Text style={styles.actionText}>
                    {PARENT_MODE_LABELS[mode]}
                    {settings.parentPolicies[feature] === mode ? ' ✓' : ''}
                  </Text>
                </Pressable>
              ))}
            </View>
          ))}
          {state.confirmNever ? (
            <View>
              <Text style={styles.notice}>
                Never lets anyone open Parent Center and change these choices without a check on
                this device.
              </Text>
              <Action
                label="Confirm Parent Center Never"
                onPress={() => {
                  void owner.setPolicy('parentCenter', 'never', true);
                }}
              />
              <Action label="Keep current Parent Center protection" onPress={owner.cancelNever} />
            </View>
          ) : null}
          <Text accessibilityLiveRegion="polite" style={styles.notice}>
            {settings.message}
          </Text>
          {settings.status === 'saving' ? (
            <Text style={styles.notice}>Saving Parent Center choices…</Text>
          ) : null}
          {settings.status === 'ready' && !settings.saved ? (
            <>
              <Action
                label="Retry saving Parent Center choices"
                onPress={() => {
                  void owner.retryParentSave();
                }}
              />
              <Action
                label="Read saved settings again"
                onPress={() => {
                  void owner.settings.retryRead();
                }}
              />
            </>
          ) : null}
          <Action label="Keep drawing" onPress={owner.closeParentCenter} />
        </ScrollView>
      </NativeFrame>
    </Modal>
  );
}

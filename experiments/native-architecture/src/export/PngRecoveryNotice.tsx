import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CONTROL_GAP,
  CONTROL_RADIUS,
  DRAWING_SCALE,
  DRAWING_THEME,
  TOUCH_TARGET,
} from '../drawing/theme';
import type { PngRecoveryState } from './pngRecovery';

function RecoveryAction({
  label,
  accessibilityLabel,
  disabled,
  onPress,
}: {
  label: 'Try again' | 'Dismiss';
  accessibilityLabel: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

export function PngRecoveryNotice({
  state,
  drawing,
  blocked,
  retry,
  dismiss,
}: {
  state: PngRecoveryState;
  drawing: boolean;
  blocked: boolean;
  retry: () => void;
  dismiss: (id: string) => void;
}) {
  const [settled, setSettled] = useState(state);
  // Async recovery must not move the paper frame underneath active contacts.
  if (!drawing && settled !== state) setSettled(state);
  const visible = drawing ? settled : state;
  const pending = visible.pictures.length > 0;
  if (!pending && !visible.notice) return null;
  return (
    <View style={styles.panel}>
      <View accessibilityLiveRegion="polite">
        {visible.pictures.map((picture) => (
          <View key={picture.id}>
            <Text style={styles.message}>
              {picture.durable
                ? 'PNG held on this device for retry.'
                : 'PNG held only while this screen stays open.'}
            </Text>
            <Text style={styles.filename}>{picture.filename}</Text>
            {picture.attempt.status === 'failed' ? (
              <Text style={styles.message}>{picture.attempt.message}</Text>
            ) : null}
            {picture.attempt.status === 'sharing-closed' ? (
              <Text style={styles.message}>
                Share sheet closed. This PNG is kept until you dismiss it.
              </Text>
            ) : null}
            {picture.attempt.status === 'download-requested' ? (
              <Text style={styles.message}>
                Download requested. This PNG is kept until you dismiss it.
              </Text>
            ) : null}
            <RecoveryAction
              label="Dismiss"
              accessibilityLabel={`Dismiss held PNG ${picture.filename}`}
              disabled={drawing || blocked}
              onPress={() => dismiss(picture.id)}
            />
          </View>
        ))}
        {visible.notice ? <Text style={styles.message}>{visible.notice}</Text> : null}
      </View>
      {pending || visible.status === 'unreadable' ? (
        <View style={styles.actions}>
          <RecoveryAction
            label="Try again"
            accessibilityLabel="Try PNG export again"
            disabled={drawing || blocked || state.busy}
            onPress={retry}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: DRAWING_SCALE.space2,
    padding: DRAWING_SCALE.space3,
    borderRadius: CONTROL_RADIUS,
    backgroundColor: DRAWING_THEME.brandWash,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: CONTROL_GAP },
  action: {
    minWidth: TOUCH_TARGET,
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: DRAWING_SCALE.space3,
    borderRadius: CONTROL_RADIUS,
    backgroundColor: DRAWING_THEME.surface,
  },
  actionText: {
    color: DRAWING_THEME.textStrong,
    fontSize: DRAWING_SCALE.fontSizeMd,
    fontWeight: DRAWING_SCALE.fontWeightSemibold,
  },
  message: { color: DRAWING_THEME.textStrong, fontSize: DRAWING_SCALE.fontSizeMd },
  filename: { color: DRAWING_THEME.textSoft, fontSize: DRAWING_SCALE.fontSizeSm },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
});

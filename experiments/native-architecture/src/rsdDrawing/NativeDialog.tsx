import type { ReactNode } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { DRAWING_SCALE, DRAWING_THEME } from '../drawing/theme';
import { NativeFrame } from './NativeFrame';
import { html } from 'react-strict-dom';
import type { SoundSettingsState } from '../settings/soundSettings';
import { RsdAction, styles as controlStyles } from './controls';

export function NativeSoundSettingsDialog({
  settings,
  notice,
  onToggle,
  onRetry,
  onClose,
}: {
  settings: SoundSettingsState;
  notice: string;
  onToggle: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <NativeDialog
      visible
      label="Drawing settings"
      onClose={onClose}
      footer={<RsdAction label="Keep drawing" onClick={onClose} />}
    >
      <html.div style={controlStyles.dialogContent}>
        <RsdAction
          label={settings.soundEnabled ? 'Drawing sound on' : 'Drawing sound off'}
          selection="switch"
          selected={settings.soundEnabled}
          disabled={settings.status !== 'ready'}
          onClick={onToggle}
        />
        {notice ? <html.span aria-live="polite">{notice}</html.span> : null}
        <RsdAction
          label="Try saving settings again"
          disabled={settings.status === 'loading'}
          onClick={onRetry}
        />
      </html.div>
    </NativeDialog>
  );
}

export function NativeDialog({
  visible,
  label,
  onClose,
  onDismiss,
  footer,
  children,
}: {
  visible: boolean;
  label: string;
  onClose: () => void;
  onDismiss?: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      animationType="none"
      accessibilityLabel={label}
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      <NativeFrame>
        <ScrollView
          testID="rsd-dialog-viewport"
          accessibilityLabel={`${label} options`}
          accessible={false}
          style={styles.viewport}
          contentContainerStyle={styles.content}
          removeClippedSubviews={false}
        >
          {children}
        </ScrollView>
        <View testID="rsd-dialog-footer" accessible={false} style={styles.footer}>
          {footer}
        </View>
      </NativeFrame>
    </Modal>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0 },
  content: { flexGrow: 1 },
  footer: {
    flexShrink: 0,
    padding: DRAWING_SCALE.space4,
    backgroundColor: DRAWING_THEME.surface,
  },
});

import { BRUSHES } from '../drawing/brushes';
import {
  OPTIONAL_BRUSHES,
  type OptionalBrush,
  type BrushPreferencesState,
} from '../settings/brushPreferences';
import { useDrawingAppearance } from '../drawing/DrawingAppearance';
import { darkTheme } from './tokens.css';
import {
  APPEARANCE_PREFERENCES,
  APPEARANCE_LABELS,
  type AppearancePreference,
} from '../settings/appearance';
import { createDrawingStyles, useDrawingStyles } from '../drawing/DrawingAppearance';
import type { ReactNode } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { DRAWING_SCALE } from '../drawing/theme';
import { NativeFrame } from './NativeFrame';
import { html } from 'react-strict-dom';
import type { SoundSettingsState } from '../settings/soundSettings';
import { RsdAction, styles as controlStyles } from './controls';

export function NativeSoundSettingsDialog({
  settings,
  brushState,
  onBrushAvailabilityChange,
  onRetryBrushSave,
  notice,
  onToggle,
  onAppearanceChange,
  onColoringBookChange,
  onRetry,
  onClose,
  onParentCenter,
  visible = true,
  onDismiss,
}: {
  settings: SoundSettingsState;
  brushState: BrushPreferencesState;
  onBrushAvailabilityChange: (brush: OptionalBrush, enabled: boolean) => void;
  onRetryBrushSave: () => void;
  notice: string;
  onToggle: () => void;
  onAppearanceChange: (appearance: AppearancePreference) => void;
  onColoringBookChange: (enabled: boolean) => void;
  onRetry: () => void;
  onClose: () => void;
  onParentCenter: () => void;
  visible?: boolean;
  onDismiss?: () => void;
}) {
  return (
    <NativeDialog
      visible={visible}
      onDismiss={onDismiss}
      label="Drawing settings"
      onClose={onClose}
      footer={<RsdAction label="Keep drawing" onClick={onClose} />}
    >
      <html.div style={controlStyles.dialogContent}>
        <RsdAction label="Manage Parent Center" onClick={onParentCenter} />
        {OPTIONAL_BRUSHES.map((brush) => (
          <RsdAction
            key={brush}
            label={`Show ${BRUSHES[brush].label}`}
            selection="switch"
            selected={brushState.availability[brush]}
            disabled={brushState.status !== 'ready'}
            onClick={() => onBrushAvailabilityChange(brush, !brushState.availability[brush])}
          />
        ))}
        {brushState.message ? <html.span aria-live="polite">{brushState.message}</html.span> : null}
        {!brushState.saved ? (
          <RsdAction label="Retry saving brush choices" onClick={onRetryBrushSave} />
        ) : null}
        <RsdAction
          label={settings.coloringBookEnabled ? 'Coloring book on' : 'Coloring book off'}
          selection="switch"
          selected={settings.coloringBookEnabled}
          disabled={settings.status !== 'ready'}
          onClick={() => onColoringBookChange(!settings.coloringBookEnabled)}
        />
        <html.span>Appearance</html.span>
        <html.div role="radiogroup" aria-label="Appearance" style={controlStyles.row}>
          {APPEARANCE_PREFERENCES.map((appearance) => (
            <RsdAction
              key={appearance}
              label={`${APPEARANCE_LABELS[appearance]} appearance`}
              text={APPEARANCE_LABELS[appearance]}
              selection="radio"
              selected={settings.appearance === appearance}
              disabled={settings.status !== 'ready'}
              onClick={() => onAppearanceChange(appearance)}
            />
          ))}
        </html.div>
        <html.span>System follows your device.</html.span>
        <RsdAction
          label={settings.soundEnabled ? 'Drawing sound on' : 'Drawing sound off'}
          selection="switch"
          selected={settings.soundEnabled}
          disabled={settings.status !== 'ready'}
          onClick={onToggle}
        />
        {settings.status === 'saving' ? <html.span>Saving settings…</html.span> : null}
        {notice ? <html.span aria-live="polite">{notice}</html.span> : null}
        {settings.status === 'ready' && !settings.saved ? (
          <RsdAction label="Try saving settings again" onClick={onRetry} />
        ) : null}
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
  const styles = useDrawingStyles(themedStyles);
  const theme = useDrawingAppearance();
  return (
    <Modal
      statusBarTranslucent
      navigationBarTranslucent
      visible={visible}
      animationType="none"
      accessibilityLabel={label}
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      <NativeFrame>
        <html.div style={[controlStyles.themeRoot, theme === 'dark' && darkTheme]}>
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
        </html.div>
      </NativeFrame>
    </Modal>
  );
}

const themedStyles = createDrawingStyles((palette) =>
  StyleSheet.create({
    viewport: { flex: 1, minHeight: 0 },
    content: { flexGrow: 1 },
    footer: {
      flexShrink: 0,
      padding: DRAWING_SCALE.space4,
      backgroundColor: palette.surface,
    },
  })
);

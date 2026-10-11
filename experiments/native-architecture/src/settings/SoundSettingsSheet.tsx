import { APPEARANCE_PREFERENCES, APPEARANCE_LABELS, type AppearancePreference } from './appearance';
import {
  createDrawingStyles,
  useDrawingStyles,
  useDrawingTheme,
} from '../drawing/DrawingAppearance';
import { useEffect } from 'react';
import { NativeFrame } from '../rsdDrawing/NativeFrame';
import { Modal, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { SETTINGS_METRICS, TOUCH_TARGET } from '../drawing/theme';
import type { SoundSettingsState } from './soundSettings';

const SETTINGS_MAX_WIDTH = 480;

export function SoundSettings({
  state,
  audioMessage,
  onChange,
  onAppearanceChange,
  onRetrySave,
  onClose,
  visible,
  onDismiss,
}: {
  state: SoundSettingsState;
  audioMessage: string;
  onChange: (enabled: boolean) => void;
  onAppearanceChange: (appearance: AppearancePreference) => void;
  onRetrySave: () => void;
  onClose: () => void;
  visible: boolean;
  onDismiss: () => void;
}) {
  const styles = useDrawingStyles(themedStyles);
  const theme = useDrawingTheme();
  const busy = state.status !== 'ready' || !visible;
  useEffect(() => {
    if (!visible && Platform.OS === 'android') onDismiss();
  }, [visible, onDismiss]);
  return (
    <Modal
      statusBarTranslucent
      navigationBarTranslucent
      visible={visible}
      onDismiss={onDismiss}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <NativeFrame>
        <View style={styles.backdrop}>
          <View accessibilityViewIsModal style={styles.card}>
            <Text accessibilityRole="header" style={styles.title}>
              Settings
            </Text>
            <Text style={styles.labelText}>Appearance</Text>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Appearance"
              style={styles.appearanceRow}
            >
              {APPEARANCE_PREFERENCES.map((appearance) => (
                <Pressable
                  key={appearance}
                  accessibilityRole="radio"
                  accessibilityLabel={`${APPEARANCE_LABELS[appearance]} appearance`}
                  accessibilityState={{ checked: state.appearance === appearance, disabled: busy }}
                  aria-checked={state.appearance === appearance}
                  disabled={busy}
                  onPress={() => onAppearanceChange(appearance)}
                  style={styles.button}
                >
                  <Text style={styles.labelText}>
                    {APPEARANCE_LABELS[appearance]}
                    {state.appearance === appearance ? ' ✓' : ''}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.help}>System follows your device.</Text>
            <View style={styles.row}>
              <View style={styles.label}>
                <Text style={styles.labelText}>Sound</Text>
                <Text style={styles.help}>Play a soft scratch while drawing.</Text>
              </View>
              <Switch
                accessibilityLabel="Drawing sound"
                accessibilityHint="Play a soft scratch while drawing"
                value={state.soundEnabled}
                disabled={busy}
                onValueChange={onChange}
                style={styles.switch}
                trackColor={{ true: theme.brandSolid, false: theme.textSoft }}
              />
            </View>
            {state.status === 'loading' ? <Text style={styles.help}>Loading settings…</Text> : null}
            {state.status === 'saving' ? <Text style={styles.help}>Saving settings…</Text> : null}
            <Text accessibilityLiveRegion="polite" style={styles.help}>
              {state.message || audioMessage}
            </Text>
            {state.status === 'ready' && !state.saved ? (
              <Pressable accessibilityRole="button" onPress={onRetrySave} style={styles.button}>
                <Text style={styles.labelText}>Retry saving</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close Settings"
              disabled={!visible}
              onPress={onClose}
              style={styles.button}
            >
              <Text style={styles.labelText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </NativeFrame>
    </Modal>
  );
}
const themedStyles = createDrawingStyles((palette) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: SETTINGS_METRICS.padding,
      backgroundColor: 'rgba(0, 0, 0, 0.35)',
    },
    card: {
      width: '100%',
      maxWidth: SETTINGS_MAX_WIDTH,
      padding: SETTINGS_METRICS.padding,
      borderRadius: SETTINGS_METRICS.radius,
      backgroundColor: palette.paper,
      gap: SETTINGS_METRICS.gap * 2,
    },
    title: {
      color: palette.textStrong,
      fontSize: SETTINGS_METRICS.titleSize,
      fontWeight: '700',
    },
    appearanceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SETTINGS_METRICS.gap },
    row: { flexDirection: 'row', alignItems: 'center', gap: SETTINGS_METRICS.gap },
    label: { flex: 1, gap: SETTINGS_METRICS.gap },
    labelText: {
      color: palette.textStrong,
      fontSize: SETTINGS_METRICS.textSize,
      fontWeight: '600',
    },
    help: { color: palette.text, fontSize: SETTINGS_METRICS.textSize },
    switch: { minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET },
    button: {
      minHeight: TOUCH_TARGET,
      minWidth: TOUCH_TARGET,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SETTINGS_METRICS.padding,
      borderRadius: SETTINGS_METRICS.radius,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.borderWarm,
    },
  })
);

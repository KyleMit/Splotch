import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { DRAWING_THEME, SETTINGS_METRICS, TOUCH_TARGET } from '../drawing/theme';
import type { SoundSettingsState } from './soundSettings';

const SETTINGS_MAX_WIDTH = 480;

export function SoundSettings({
  state,
  audioMessage,
  onChange,
  onRetrySave,
  onClose,
}: {
  state: SoundSettingsState;
  audioMessage: string;
  onChange: (enabled: boolean) => void;
  onRetrySave: () => void;
  onClose: () => void;
}) {
  const busy = state.status !== 'ready';
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>
            Settings
          </Text>
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
              trackColor={{ true: DRAWING_THEME.brandSolid, false: DRAWING_THEME.textSoft }}
            />
          </View>
          {state.status === 'loading' ? (
            <Text style={styles.help}>Loading sound settings…</Text>
          ) : null}
          {state.status === 'saving' ? (
            <Text style={styles.help}>Saving sound setting…</Text>
          ) : null}
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
            onPress={onClose}
            style={styles.button}
          >
            <Text style={styles.labelText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
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
    backgroundColor: DRAWING_THEME.paper,
    gap: SETTINGS_METRICS.gap * 2,
  },
  title: {
    color: DRAWING_THEME.textStrong,
    fontSize: SETTINGS_METRICS.titleSize,
    fontWeight: '700',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: SETTINGS_METRICS.gap },
  label: { flex: 1, gap: SETTINGS_METRICS.gap },
  labelText: {
    color: DRAWING_THEME.textStrong,
    fontSize: SETTINGS_METRICS.textSize,
    fontWeight: '600',
  },
  help: { color: DRAWING_THEME.text, fontSize: SETTINGS_METRICS.textSize },
  switch: { minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET },
  button: {
    minHeight: TOUCH_TARGET,
    minWidth: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SETTINGS_METRICS.padding,
    borderRadius: SETTINGS_METRICS.radius,
    backgroundColor: DRAWING_THEME.surface,
    borderWidth: 1,
    borderColor: DRAWING_THEME.borderWarm,
  },
});

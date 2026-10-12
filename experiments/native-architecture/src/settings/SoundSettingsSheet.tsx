import { DrawingControlChoices } from './DrawingControlChoices';
import { BRUSHES } from '../drawing/brushes';
import {
  OPTIONAL_BRUSHES,
  type OptionalBrush,
  type BrushPreferencesState,
} from './brushPreferences';
import { ColoringBookSetting } from './ColoringBookSetting';
import { APPEARANCE_PREFERENCES, APPEARANCE_LABELS, type AppearancePreference } from './appearance';
import {
  createDrawingStyles,
  useDrawingStyles,
  useDrawingTheme,
} from '../drawing/DrawingAppearance';
import { useEffect, useState } from 'react';
import { InformationSection } from '../information/InformationSection';
import { type InformationPage } from '../information/content';
import { NativeFrame } from '../rsdDrawing/NativeFrame';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SETTINGS_METRICS, TOUCH_TARGET } from '../drawing/theme';
import type { SoundSettingsState } from './soundSettings';
import { SOUND_LEVELS, SOUND_LEVEL_LABELS, type SoundLevel } from './soundLevel';

const SETTINGS_MAX_WIDTH = 480;

type SoundSettingsProps = {
  state: SoundSettingsState;
  brushState: BrushPreferencesState;
  onBrushAvailabilityChange: (brush: OptionalBrush, enabled: boolean) => void;
  onRetryBrushSave: () => void;
  audioMessage: string;
  onChange: (enabled: boolean) => void;
  onUndoButtonChange: (enabled: boolean) => void;
  onStrokeWidthControlChange: (enabled: boolean) => void;
  onSoundLevelChange: (level: SoundLevel) => void;
  onAppearanceChange: (appearance: AppearancePreference) => void;
  onColoringBookChange: (enabled: boolean) => void;
  onRetrySave: () => void;
  onParentCenter: () => void;
  onClose: () => void;
  visible: boolean;
  onDismiss: () => void;
};

export function SoundSettings({
  state,
  brushState,
  onBrushAvailabilityChange,
  onRetryBrushSave,
  audioMessage,
  onChange,
  onUndoButtonChange,
  onStrokeWidthControlChange,
  onSoundLevelChange,
  onAppearanceChange,
  onColoringBookChange,
  onRetrySave,
  onParentCenter,
  onClose,
  visible,
  onDismiss,
}: SoundSettingsProps) {
  const styles = useDrawingStyles(themedStyles);
  const busy = state.status !== 'ready' || !visible;
  const [informationPage, setInformationPage] = useState<InformationPage | null>(null);
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
      onRequestClose={informationPage ? () => setInformationPage(null) : onClose}
    >
      <NativeFrame variant="overlay">
        <View style={styles.backdrop}>
          <View accessibilityViewIsModal style={styles.card}>
            {informationPage ? (
              <SettingsInformation
                page={informationPage}
                onNavigate={setInformationPage}
                onBack={() => setInformationPage(null)}
                onClose={onClose}
              />
            ) : (
              <>
                <ScrollView
                  style={styles.scrollArea}
                  contentContainerStyle={styles.settingsContent}
                >
                  <Text accessibilityRole="header" style={styles.title}>
                    Settings
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Help and about"
                    onPress={() => setInformationPage('help')}
                    style={styles.button}
                  >
                    <Text style={styles.labelText}>Help and about</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Manage Parent Center"
                    onPress={onParentCenter}
                    style={styles.button}
                  >
                    <Text style={styles.labelText}>Parent Center</Text>
                  </Pressable>
                  <SettingsChoices
                    {...{
                      state,
                      brushState,
                      busy,
                      onBrushAvailabilityChange,
                      onRetryBrushSave,
                      onColoringBookChange,
                      onUndoButtonChange,
                      onStrokeWidthControlChange,
                      onAppearanceChange,
                      onChange,
                      onSoundLevelChange,
                    }}
                  />
                  {state.status === 'loading' ? (
                    <Text style={styles.help}>Loading settings…</Text>
                  ) : null}
                  {state.status === 'saving' ? (
                    <Text style={styles.help}>Saving settings…</Text>
                  ) : null}
                  <Text accessibilityLiveRegion="polite" style={styles.help}>
                    {state.message || audioMessage}
                  </Text>
                  {state.status === 'ready' && !state.saved ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={onRetrySave}
                      style={styles.button}
                    >
                      <Text style={styles.labelText}>Retry saving</Text>
                    </Pressable>
                  ) : null}
                </ScrollView>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close Settings"
                  disabled={!visible}
                  onPress={onClose}
                  style={styles.button}
                >
                  <Text style={styles.labelText}>Done</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </NativeFrame>
    </Modal>
  );
}
function SettingsChoices({
  state,
  brushState,
  busy,
  onBrushAvailabilityChange,
  onRetryBrushSave,
  onColoringBookChange,
  onUndoButtonChange,
  onStrokeWidthControlChange,
  onAppearanceChange,
  onChange,
  onSoundLevelChange,
}: Pick<
  SoundSettingsProps,
  | 'state'
  | 'brushState'
  | 'onBrushAvailabilityChange'
  | 'onRetryBrushSave'
  | 'onColoringBookChange'
  | 'onUndoButtonChange'
  | 'onStrokeWidthControlChange'
  | 'onAppearanceChange'
  | 'onChange'
  | 'onSoundLevelChange'
> & { busy: boolean }) {
  return (
    <>
      <BrushChoices
        state={brushState}
        busy={busy}
        onChange={onBrushAvailabilityChange}
        onRetry={onRetryBrushSave}
      />
      <ColoringBookSetting
        enabled={state.coloringBookEnabled}
        disabled={busy}
        onChange={onColoringBookChange}
      />
      <DrawingControlChoices
        state={state}
        busy={busy}
        onUndoButtonChange={onUndoButtonChange}
        onStrokeWidthControlChange={onStrokeWidthControlChange}
      />
      <AppearanceChoices selected={state.appearance} busy={busy} onChange={onAppearanceChange} />
      <SoundChoice enabled={state.soundEnabled} busy={busy} onChange={onChange} />
      <SoundLevelChoices selected={state.soundLevel} busy={busy} onChange={onSoundLevelChange} />
    </>
  );
}

function SettingsInformation({
  page,
  onNavigate,
  onBack,
  onClose,
}: {
  page: InformationPage;
  onNavigate: (page: InformationPage) => void;
  onBack: () => void;
  onClose: SoundSettingsProps['onClose'];
}) {
  const styles = useDrawingStyles(themedStyles);
  return (
    <>
      <ScrollView style={styles.scrollArea}>
        <InformationSection page={page} onNavigate={onNavigate} />
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to Settings"
        onPress={onBack}
        style={styles.button}
      >
        <Text style={styles.labelText}>Back to Settings</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Keep drawing"
        onPress={onClose}
        style={styles.button}
      >
        <Text style={styles.labelText}>Keep drawing</Text>
      </Pressable>
    </>
  );
}

function AppearanceChoices({
  selected,
  busy,
  onChange,
}: {
  selected: AppearancePreference;
  busy: boolean;
  onChange: SoundSettingsProps['onAppearanceChange'];
}) {
  const styles = useDrawingStyles(themedStyles);
  return (
    <>
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
            accessibilityState={{ checked: selected === appearance, disabled: busy }}
            aria-checked={selected === appearance}
            disabled={busy}
            onPress={() => onChange(appearance)}
            style={styles.button}
          >
            <Text style={styles.labelText}>
              {APPEARANCE_LABELS[appearance]}
              {selected === appearance ? ' ✓' : ''}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.help}>System follows your device.</Text>
    </>
  );
}

function SoundLevelChoices({
  selected,
  busy,
  onChange,
}: {
  selected: SoundLevel;
  busy: boolean;
  onChange: SoundSettingsProps['onSoundLevelChange'];
}) {
  const styles = useDrawingStyles(themedStyles);
  return (
    <>
      <Text style={styles.labelText}>Drawing sound level</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Drawing sound level"
        style={styles.appearanceRow}
      >
        {SOUND_LEVELS.map((level) => (
          <Pressable
            key={level}
            accessibilityRole="radio"
            accessibilityLabel={`${SOUND_LEVEL_LABELS[level]} drawing sound`}
            accessibilityState={{ checked: selected === level, disabled: busy }}
            aria-checked={selected === level}
            disabled={busy}
            onPress={() => onChange(level)}
            style={styles.button}
          >
            <Text style={styles.labelText}>
              {SOUND_LEVEL_LABELS[level]}
              {selected === level ? ' ✓' : ''}
            </Text>
          </Pressable>
        ))}
      </View>
    </>
  );
}

function SoundChoice({
  enabled,
  busy,
  onChange,
}: {
  enabled: boolean;
  busy: boolean;
  onChange: SoundSettingsProps['onChange'];
}) {
  const styles = useDrawingStyles(themedStyles);
  const theme = useDrawingTheme();
  return (
    <View style={styles.row}>
      <View style={styles.label}>
        <Text style={styles.labelText}>Sound</Text>
        <Text style={styles.help}>Play a soft scratch while drawing.</Text>
      </View>
      <Switch
        accessibilityLabel="Drawing sound"
        accessibilityHint="Play a soft scratch while drawing"
        value={enabled}
        disabled={busy}
        onValueChange={onChange}
        style={styles.switch}
        trackColor={{ true: theme.brandSolid, false: theme.textSoft }}
      />
    </View>
  );
}

function BrushChoices({
  state,
  busy,
  onChange,
  onRetry,
}: {
  state: BrushPreferencesState;
  busy: boolean;
  onChange: SoundSettingsProps['onBrushAvailabilityChange'];
  onRetry: () => void;
}) {
  const styles = useDrawingStyles(themedStyles);
  const theme = useDrawingTheme();
  return (
    <>
      {OPTIONAL_BRUSHES.map((brush) => (
        <View key={brush} style={styles.row}>
          <Text style={styles.labelText}>{BRUSHES[brush].label}</Text>
          <Switch
            accessibilityLabel={`Show ${BRUSHES[brush].label}`}
            value={state.availability[brush]}
            disabled={busy || state.status !== 'ready'}
            onValueChange={(enabled) => onChange(brush, enabled)}
            style={styles.switch}
            trackColor={{ true: theme.brandSolid, false: theme.textSoft }}
          />
        </View>
      ))}
      {state.message ? <Text style={styles.help}>{state.message}</Text> : null}
      {!state.saved ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry saving brush choices"
          onPress={onRetry}
          style={styles.button}
        >
          <Text style={styles.labelText}>Retry saving brush choices</Text>
        </Pressable>
      ) : null}
    </>
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
      maxHeight: '100%',
      maxWidth: SETTINGS_MAX_WIDTH,
      padding: SETTINGS_METRICS.padding,
      borderRadius: SETTINGS_METRICS.radius,
      backgroundColor: palette.paper,
      gap: SETTINGS_METRICS.gap * 2,
    },
    scrollArea: { flexShrink: 1, minHeight: 0 },
    settingsContent: { gap: SETTINGS_METRICS.gap * 2 },
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

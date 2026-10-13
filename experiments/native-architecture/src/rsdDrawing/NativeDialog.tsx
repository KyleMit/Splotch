import { DrawingModal as Modal } from '../platform/DrawingModal';
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
import { ScrollView, StyleSheet, View } from 'react-native';
import { DRAWING_SCALE } from '../drawing/theme';
import { NativeFrame } from './NativeFrame';
import { html } from 'react-strict-dom';
import type { SoundSettingsState } from '../settings/soundSettings';
import { SOUND_LEVELS, SOUND_LEVEL_LABELS, type SoundLevel } from '../settings/soundLevel';
import { RsdAction, styles as controlStyles } from './controls';
import { useState } from 'react';
import { INFORMATION_CONTENT, type InformationPage } from '../information/content';
import { RsdInformationSection } from './RsdInformationSection';
import { RsdOrientationChoices } from './RsdOrientationChoices';
import type { OrientationChoice } from '../settings/orientation';

type NativeSoundSettingsDialogProps = {
  settings: SoundSettingsState;
  brushState: BrushPreferencesState;
  onBrushAvailabilityChange: (brush: OptionalBrush, enabled: boolean) => void;
  onRetryBrushSave: () => void;
  notice: string;
  onToggle: () => void;
  onUndoButtonChange: (enabled: boolean) => void;
  onStrokeWidthControlChange: (enabled: boolean) => void;
  onSoundLevelChange: (level: SoundLevel) => void;
  onAppearanceChange: (appearance: AppearancePreference) => void;
  onOrientationChange: (orientation: OrientationChoice) => void;
  onColoringBookChange: (enabled: boolean) => void;
  onRetry: () => void;
  onClose: () => void;
  onParentCenter: () => void;
  visible?: boolean;
  onDismiss?: () => void;
};

export function NativeSoundSettingsDialog({
  settings,
  brushState,
  onBrushAvailabilityChange,
  onRetryBrushSave,
  notice,
  onToggle,
  onUndoButtonChange,
  onStrokeWidthControlChange,
  onSoundLevelChange,
  onAppearanceChange,
  onOrientationChange,
  onColoringBookChange,
  onRetry,
  onClose,
  onParentCenter,
  visible = true,
  onDismiss,
}: NativeSoundSettingsDialogProps) {
  const busy = settings.status !== 'ready' || !visible;
  const [informationPage, setInformationPage] = useState<InformationPage | null>(null);
  return (
    <NativeDialog
      visible={visible}
      onDismiss={onDismiss}
      label={informationPage ? INFORMATION_CONTENT[informationPage].title : 'Drawing settings'}
      onClose={informationPage ? () => setInformationPage(null) : onClose}
      footer={
        <html.div style={controlStyles.row}>
          {informationPage ? (
            <RsdAction label="Back to Settings" onClick={() => setInformationPage(null)} />
          ) : null}
          <RsdAction label="Keep drawing" onClick={onClose} />
        </html.div>
      }
    >
      {informationPage ? (
        <RsdInformationSection page={informationPage} onNavigate={setInformationPage} />
      ) : (
        <html.div style={controlStyles.dialogContent}>
          <RsdAction label="Manage Parent Center" onClick={onParentCenter} />
          <RsdAction label="Help and about" onClick={() => setInformationPage('help')} />
          {OPTIONAL_BRUSHES.map((brush) => (
            <RsdAction
              key={brush}
              label={`Show ${BRUSHES[brush].label}`}
              selection="switch"
              selected={brushState.availability[brush]}
              disabled={busy || brushState.status !== 'ready'}
              onClick={() => onBrushAvailabilityChange(brush, !brushState.availability[brush])}
            />
          ))}
          {brushState.message ? (
            <html.span aria-live="polite">{brushState.message}</html.span>
          ) : null}
          {!brushState.saved ? (
            <RsdAction label="Retry saving brush choices" onClick={onRetryBrushSave} />
          ) : null}
          <RsdAction
            label={settings.coloringBookEnabled ? 'Coloring book on' : 'Coloring book off'}
            selection="switch"
            selected={settings.coloringBookEnabled}
            disabled={busy}
            onClick={() => onColoringBookChange(!settings.coloringBookEnabled)}
          />
          <RsdAction
            label="Show Undo button"
            selection="switch"
            selected={settings.undoButtonEnabled}
            disabled={busy}
            onClick={() => onUndoButtonChange(!settings.undoButtonEnabled)}
          />
          <RsdAction
            label="Show drawing width controls"
            selection="switch"
            selected={settings.strokeWidthControlEnabled}
            disabled={busy}
            onClick={() => onStrokeWidthControlChange(!settings.strokeWidthControlEnabled)}
          />
          <AppearanceChoices
            settings={settings}
            busy={busy}
            onAppearanceChange={onAppearanceChange}
            onOrientationChange={onOrientationChange}
          />
          <RsdAction
            label={settings.soundEnabled ? 'Drawing sound on' : 'Drawing sound off'}
            selection="switch"
            selected={settings.soundEnabled}
            disabled={busy}
            onClick={onToggle}
          />
          <html.span>Drawing sound level</html.span>
          <html.div role="radiogroup" aria-label="Drawing sound level" style={controlStyles.row}>
            {SOUND_LEVELS.map((level) => (
              <RsdAction
                key={level}
                label={`${SOUND_LEVEL_LABELS[level]} drawing sound`}
                text={SOUND_LEVEL_LABELS[level]}
                selection="radio"
                selected={settings.soundLevel === level}
                disabled={busy}
                onClick={() => onSoundLevelChange(level)}
              />
            ))}
          </html.div>
          {settings.status === 'saving' ? <html.span>Saving settings…</html.span> : null}
          {notice ? <html.span aria-live="polite">{notice}</html.span> : null}
          {settings.status === 'ready' && !settings.saved ? (
            <RsdAction label="Try saving settings again" onClick={onRetry} />
          ) : null}
        </html.div>
      )}
    </NativeDialog>
  );
}

function AppearanceChoices({
  settings,
  busy,
  onAppearanceChange,
  onOrientationChange,
}: Pick<
  NativeSoundSettingsDialogProps,
  'settings' | 'onAppearanceChange' | 'onOrientationChange'
> & {
  busy: boolean;
}) {
  return (
    <>
      <html.span>Appearance</html.span>
      <html.div role="radiogroup" aria-label="Appearance" style={controlStyles.row}>
        {APPEARANCE_PREFERENCES.map((appearance) => (
          <RsdAction
            key={appearance}
            label={`${APPEARANCE_LABELS[appearance]} appearance`}
            text={APPEARANCE_LABELS[appearance]}
            selection="radio"
            selected={settings.appearance === appearance}
            disabled={busy}
            onClick={() => onAppearanceChange(appearance)}
          />
        ))}
      </html.div>
      <html.span>System follows your device.</html.span>
      <RsdOrientationChoices
        selected={settings.orientation}
        busy={busy}
        onChange={onOrientationChange}
      />
    </>
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

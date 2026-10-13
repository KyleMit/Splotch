import { BRUSHES } from '../drawing/brushes';
import {
  OPTIONAL_BRUSHES,
  type OptionalBrush,
  type BrushPreferencesState,
} from '../settings/brushPreferences';
import {
  APPEARANCE_PREFERENCES,
  APPEARANCE_LABELS,
  type AppearancePreference,
} from '../settings/appearance';
import { html } from 'react-strict-dom';
import type { SoundSettingsState } from '../settings/soundSettings';
import { SOUND_LEVELS, SOUND_LEVEL_LABELS, type SoundLevel } from '../settings/soundLevel';
import { RsdAction, styles as controlStyles } from './controls';
import { useState } from 'react';
import { INFORMATION_CONTENT, type InformationPage } from '../information/content';
import { RsdInformationSection } from './RsdInformationSection';
import { RsdInstallGuide } from './RsdInstallGuide';
import { RsdOrientationChoices } from './RsdOrientationChoices';
import type { OrientationChoice } from '../settings/orientation';
import { SAVE_ON_DELETE_HELP, SAVE_ON_DELETE_LABEL } from '../settings/saveOnDelete';
import { PENCIL_ERASER_HELP, PENCIL_ERASER_LABEL } from '../settings/pencilEraser';
import type { ReduceMotionPreference } from '../settings/reduceMotion';
import {
  NATIVE_SETTINGS_SECTIONS,
  sectionHeading,
  type NativeSettingsSectionId,
} from '../settings/settingsSections';
import { installPrompt } from '../platform/installPrompt';
import { RsdSettingsHub } from './RsdSettingsHub';
import { RsdAccessibilitySection } from './RsdAccessibilitySection';
import { RsdWhatsNewSection } from './RsdWhatsNewSection';
import { ModalShell } from './ModalShell';
import { DialogHeader } from './DialogHeader';

type NativeSoundSettingsDialogProps = {
  settings: SoundSettingsState;
  brushState: BrushPreferencesState;
  onBrushAvailabilityChange: (brush: OptionalBrush, enabled: boolean) => void;
  onRetryBrushSave: () => void;
  notice: string;
  onToggle: () => void;
  onUndoButtonChange: (enabled: boolean) => void;
  onStrokeWidthControlChange: (enabled: boolean) => void;
  onSaveOnDeleteChange: (enabled: boolean) => void;
  onPencilEraserChange: (enabled: boolean) => void;
  onSoundLevelChange: (level: SoundLevel) => void;
  onAppearanceChange: (appearance: AppearancePreference) => void;
  onOrientationChange: (orientation: OrientationChoice) => void;
  onColoringBookChange: (enabled: boolean) => void;
  onButtonScaleChange: (scale: number) => void;
  onReduceMotionChange: (preference: ReduceMotionPreference) => void;
  onWhatsNewSeen: () => void;
  onRetry: () => void;
  onClose: () => void;
  onParentCenter: () => void;
  visible?: boolean;
  onDismiss?: () => void;
};

type SettingsPage =
  | { kind: 'hub' }
  | { kind: 'section'; section: NativeSettingsSectionId }
  | { kind: 'information'; page: InformationPage };

const HUB: SettingsPage = { kind: 'hub' };
// Install has nothing to offer where the app is already installed.
const HUB_SECTIONS = NATIVE_SETTINGS_SECTIONS.filter(
  (section) => section.id !== 'setup' || installPrompt !== null
);

function pageLabel(page: SettingsPage) {
  if (page.kind === 'section') return sectionHeading(page.section);
  if (page.kind === 'information') return INFORMATION_CONTENT[page.page].title;
  return 'Settings';
}

// The shipping phone Settings: a hub of sections that each drill into their own page, with the
// header's Back returning to the hub.
export function NativeSoundSettingsDialog(props: NativeSoundSettingsDialogProps) {
  const { settings, notice, onRetry, onClose, onWhatsNewSeen, visible = true, onDismiss } = props;
  const busy = settings.status !== 'ready' || !visible;
  const [page, setPage] = useState<SettingsPage>(HUB);
  const openSection = (section: NativeSettingsSectionId) => {
    if (section === 'whatsnew') onWhatsNewSeen();
    setPage({ kind: 'section', section });
  };
  const back = () => setPage(HUB);
  return (
    <ModalShell
      visible={visible}
      onDismiss={onDismiss}
      label={pageLabel(page)}
      size="settings"
      onClose={page.kind === 'hub' ? onClose : back}
      header={
        page.kind === 'hub' ? (
          <DialogHeader title={pageLabel(page)} titleSize="xl" onClose={onClose} />
        ) : (
          <DialogHeader title={pageLabel(page)} titleSize="lg" onBack={back} onClose={onClose} />
        )
      }
    >
      {page.kind === 'information' ? (
        <RsdInformationSection
          page={page.page}
          onNavigate={(next) =>
            next === 'whatsNew'
              ? openSection('whatsnew')
              : setPage({ kind: 'information', page: next })
          }
        />
      ) : (
        <html.div style={controlStyles.dialogContent}>
          {page.kind === 'section' ? (
            <SettingsSection
              {...props}
              section={page.section}
              busy={busy}
              onHelp={() => setPage({ kind: 'information', page: 'help' })}
            />
          ) : (
            <RsdSettingsHub
              sections={HUB_SECTIONS}
              settings={settings}
              brushState={props.brushState}
              onOpen={openSection}
            />
          )}
          {settings.status === 'saving' ? <html.span>Saving settings…</html.span> : null}
          {notice ? <html.span aria-live="polite">{notice}</html.span> : null}
          {settings.status === 'ready' && !settings.saved ? (
            <RsdAction label="Try saving settings again" onClick={onRetry} />
          ) : null}
        </html.div>
      )}
    </ModalShell>
  );
}

type SectionProps = NativeSoundSettingsDialogProps & {
  section: NativeSettingsSectionId;
  busy: boolean;
  onHelp: () => void;
};

function SettingsSection(props: SectionProps) {
  const { settings, busy, onColoringBookChange } = props;
  switch (props.section) {
    case 'appearance':
      return <AppearanceChoices {...props} />;
    case 'sound':
      return <SoundChoices {...props} />;
    case 'controls':
      return <ToolDrawerChoices {...props} />;
    case 'accessibility':
      return (
        <RsdAccessibilitySection
          buttonScale={settings.buttonScale}
          busy={busy}
          onButtonScaleChange={props.onButtonScaleChange}
          onReduceMotionChange={props.onReduceMotionChange}
        />
      );
    case 'coloring':
      return (
        <RsdAction
          label={settings.coloringBookEnabled ? 'Coloring book on' : 'Coloring book off'}
          selection="switch"
          selected={settings.coloringBookEnabled}
          disabled={busy}
          onClick={() => onColoringBookChange(!settings.coloringBookEnabled)}
        />
      );
    case 'saving':
      return <SaveOnDeleteSwitch {...props} />;
    case 'parentCenter':
      return <RsdAction label="Manage Parent Center" onClick={props.onParentCenter} />;
    case 'setup':
      return <RsdInstallGuide />;
    case 'whatsnew':
      return <RsdWhatsNewSection />;
    case 'about':
      return <RsdAction label="Help and about" onClick={props.onHelp} />;
  }
}

function ToolDrawerChoices({
  settings,
  brushState,
  busy,
  onBrushAvailabilityChange,
  onRetryBrushSave,
  onUndoButtonChange,
  onStrokeWidthControlChange,
  onPencilEraserChange,
}: SectionProps) {
  return (
    <>
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
      {brushState.message ? <html.span aria-live="polite">{brushState.message}</html.span> : null}
      {!brushState.saved ? (
        <RsdAction label="Retry saving brush choices" onClick={onRetryBrushSave} />
      ) : null}
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
      {settings.applePencilSeen && brushState.availability.eraser ? (
        <>
          <RsdAction
            label={PENCIL_ERASER_LABEL}
            selection="switch"
            selected={settings.pencilEraserEnabled}
            disabled={busy}
            onClick={() => onPencilEraserChange(!settings.pencilEraserEnabled)}
          />
          <html.span>{PENCIL_ERASER_HELP}</html.span>
        </>
      ) : null}
    </>
  );
}

function SoundChoices({ settings, busy, onToggle, onSoundLevelChange }: SectionProps) {
  return (
    <>
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
    </>
  );
}

function SaveOnDeleteSwitch({ settings, busy, onSaveOnDeleteChange }: SectionProps) {
  return (
    <>
      <RsdAction
        label={SAVE_ON_DELETE_LABEL}
        selection="switch"
        selected={settings.saveOnDeleteEnabled}
        disabled={busy}
        onClick={() => onSaveOnDeleteChange(!settings.saveOnDeleteEnabled)}
      />
      <html.span>{SAVE_ON_DELETE_HELP}</html.span>
    </>
  );
}

function AppearanceChoices({
  settings,
  busy,
  onAppearanceChange,
  onOrientationChange,
}: SectionProps) {
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

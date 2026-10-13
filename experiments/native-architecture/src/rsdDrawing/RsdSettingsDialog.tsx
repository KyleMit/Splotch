import { BRUSHES } from '../drawing/brushes';
import {
  OPTIONAL_BRUSHES,
  type OptionalBrush,
  type BrushPreferencesState,
} from '../settings/brushPreferences';
import type { AppearancePreference } from '../settings/appearance';
import { html } from 'react-strict-dom';
import type { SoundSettingsState } from '../settings/soundSettings';
import type { ToolbarStyle } from '../settings/toolbarStyle';
import { RsdAction, styles as controlStyles } from './controls';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';
import { INFORMATION_CONTENT, type InformationPage } from '../information/content';
import { RsdInformationSection } from './RsdInformationSection';
import { RsdInstallGuide } from './RsdInstallGuide';
import type { OrientationChoice } from '../settings/orientation';
import { SAVE_ON_DELETE_HELP, SAVE_ON_DELETE_LABEL } from '../settings/saveOnDelete';
import { PENCIL_ERASER_HELP, PENCIL_ERASER_LABEL } from '../settings/pencilEraser';
import type { ReduceMotionPreference } from '../settings/reduceMotion';
import {
  NATIVE_SETTINGS_SECTIONS,
  sectionHeading,
  type NativeSettingsSectionId,
  type SectionSummaryContext,
} from '../settings/settingsSections';
import { installPrompt } from '../platform/installPrompt';
import { RsdSettingsHub, useHubToggles, useSectionActivity } from './RsdSettingsHub';
import { RsdSettingsWide } from './RsdSettingsWide';
import { RsdSettingsCompact } from './RsdSettingsCompact';
import { RsdScrollCue } from './RsdScrollCue';
import { useDialogBody } from './dialogScope';
import { settingsShell } from './modalGeometry';
import { RsdAccessibilitySection } from './RsdAccessibilitySection';
import { RsdAppearanceSection } from './RsdAppearanceSection';
import { RsdSoundSection } from './RsdSoundSection';
import type { SliderDraft } from './useSliderDraft';
import { RsdWhatsNewSection } from './RsdWhatsNewSection';
import { RsdColoringSection } from './RsdColoringSection';
import { ModalShell } from './ModalShell';
import { DialogHeader } from './DialogHeader';
import { landFocus } from './landFocus';

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
  onSoundVolumeChange: (volume: number) => void;
  onDrawingSoundChange: (enabled: boolean) => void;
  onDeleteSoundChange: (enabled: boolean) => void;
  onAppearanceChange: (appearance: AppearancePreference) => void;
  onToolbarStyleChange: (style: ToolbarStyle) => void;
  onOrientationChange: (orientation: OrientationChoice) => void;
  onColoringBookChange: (enabled: boolean) => void;
  // Lifted to the drawing screen, whose edge controls preview the size while it is dragged.
  buttonScale: SliderDraft;
  onReduceMotionChange: (preference: ReduceMotionPreference) => void;
  onWhatsNewSeen: () => void;
  onRetry: () => void;
  onClose: () => void;
  onParentCenter: () => void;
  onFeedback: () => void;
  downloadedBooks: number;
  ai: SectionSummaryContext['ai'];
  visible?: boolean;
  onDismiss?: () => void;
};

type SettingsPage =
  | { kind: 'hub'; returnTo: NativeSettingsSectionId | null }
  | { kind: 'section'; section: NativeSettingsSectionId }
  | { kind: 'information'; page: InformationPage };

const HUB: SettingsPage = { kind: 'hub', returnTo: null };
// Install has nothing to offer where the app is already installed.
const HUB_SECTIONS = NATIVE_SETTINGS_SECTIONS.filter(
  (section) => section.id !== 'setup' || installPrompt !== null
);

function pageLabel(page: SettingsPage) {
  if (page.kind === 'section') return sectionHeading(page.section);
  if (page.kind === 'information') return INFORMATION_CONTENT[page.page].title;
  return 'Settings';
}

// The shipping Settings, in the shell the window selects (ADR-0061). The phone hub drills into one
// section per page, with the header's Back returning to the hub; each move unmounts the control
// that held focus, so focus lands on what replaced it: the section's heading, or the hub row Back
// returned to. A tablet shows the sections beside a table of contents, and a landscape phone the
// quick toggles only. A rotation re-picks the shell live.
export function NativeSoundSettingsDialog(props: NativeSoundSettingsDialogProps) {
  const { settings, notice, onRetry, onClose, onWhatsNewSeen, visible = true, onDismiss } = props;
  const busy = settings.status !== 'ready' || !visible;
  const resizing = props.buttonScale.active;
  const shell = settingsShell(useWindowDimensions());
  const [page, setPage] = useState<SettingsPage>(HUB);
  const sectionTitle = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (page.kind === 'section') landFocus(sectionTitle.current);
  }, [page]);
  const toggles = useHubToggles({
    busy,
    soundEnabled: settings.soundEnabled,
    onSoundToggle: props.onToggle,
    onAppearanceChange: props.onAppearanceChange,
  });
  const context: SectionSummaryContext = {
    settings,
    brushes: props.brushState,
    downloadedBooks: props.downloadedBooks,
    ai: props.ai,
  };
  const unseen = useSectionActivity(context);
  const openSection = (section: NativeSettingsSectionId) => {
    if (section === 'feedback') {
      props.onFeedback();
      return;
    }
    if (section === 'whatsnew') onWhatsNewSeen();
    setPage({ kind: 'section', section });
  };
  const back = () =>
    setPage({ kind: 'hub', returnTo: page.kind === 'section' ? page.section : null });
  const onHelp = () => setPage({ kind: 'information', page: 'help' });
  // Only the phone shell drills in; the others show the same sections in place.
  const subpage =
    page.kind === 'information' || (shell === 'phone' && page.kind === 'section') ? page : null;
  // A see-through dialog shows only the control being dragged.
  const status = resizing ? null : (
    <SettingsStatus settings={settings} notice={notice} onRetry={onRetry} />
  );
  return (
    <ModalShell
      visible={visible}
      seeThrough={resizing}
      onDismiss={onDismiss}
      label={pageLabel(subpage ?? HUB)}
      size="settings"
      onClose={subpage ? back : onClose}
      scrolls={subpage?.kind === 'information'}
      header={
        subpage ? (
          <DialogHeader
            title={pageLabel(subpage)}
            titleSize="lg"
            titleRef={subpage.kind === 'section' ? sectionTitle : undefined}
            onBack={back}
            onClose={onClose}
          />
        ) : (
          <DialogHeader
            title={pageLabel(HUB)}
            titleSize={shell === 'compact' ? 'lg' : 'xl'}
            onClose={onClose}
          />
        )
      }
    >
      {subpage?.kind === 'information' ? (
        <RsdInformationSection
          page={subpage.page}
          onNavigate={(next) =>
            next === 'whatsNew'
              ? openSection('whatsnew')
              : setPage({ kind: 'information', page: next })
          }
        />
      ) : subpage?.kind === 'section' ? (
        <PhoneScroll>
          <SettingsSection {...props} section={subpage.section} busy={busy} onHelp={onHelp} />
          {status}
        </PhoneScroll>
      ) : shell === 'wide' ? (
        <RsdSettingsWide
          sections={HUB_SECTIONS}
          keptSection={resizing ? 'accessibility' : null}
          unseen={unseen}
          renderSection={(section) => (
            <SettingsSection {...props} section={section} busy={busy} onHelp={onHelp} />
          )}
          onSeen={(section) => {
            if (section === 'whatsnew') onWhatsNewSeen();
          }}
          onFeedback={props.onFeedback}
        >
          {status}
        </RsdSettingsWide>
      ) : shell === 'compact' ? (
        <RsdSettingsCompact
          sound={toggles.sound}
          night={toggles.appearance}
          orientation={settings.orientation}
          busy={busy}
          onOrientationChange={props.onOrientationChange}
        >
          {status}
        </RsdSettingsCompact>
      ) : (
        <PhoneScroll>
          <RsdSettingsHub
            sections={HUB_SECTIONS}
            context={context}
            toggles={toggles}
            unseen={unseen}
            returnTo={page.kind === 'hub' ? page.returnTo : null}
            onOpen={openSection}
          />
          {status}
        </PhoneScroll>
      )}
    </ModalShell>
  );
}

// The save state under the open page: saving, a notice, or the retry after a failed write.
function SettingsStatus({
  settings,
  notice,
  onRetry,
}: {
  settings: SoundSettingsState;
  notice: string;
  onRetry: () => void;
}) {
  return (
    <>
      {settings.status === 'saving' ? <html.span>Saving settings…</html.span> : null}
      {notice ? <html.span aria-live="polite">{notice}</html.span> : null}
      {settings.status === 'ready' && !settings.saved ? (
        <RsdAction label="Try saving settings again" onClick={onRetry} />
      ) : null}
    </>
  );
}

// The phone shell's one scroller, inset by the card's body padding, with its bottom edge fading
// while more lies below.
function PhoneScroll({ children }: { children: ReactNode }) {
  const body = useDialogBody();
  return (
    <RsdScrollCue
      inset={body && { top: body.top, right: body.inline, bottom: body.bottom, left: body.inline }}
    >
      <html.div style={controlStyles.dialogContent}>{children}</html.div>
    </RsdScrollCue>
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
      return (
        <RsdAppearanceSection
          appearance={settings.appearance}
          toolbarStyle={settings.toolbarStyle}
          orientation={settings.orientation}
          busy={busy}
          onAppearanceChange={props.onAppearanceChange}
          onToolbarStyleChange={props.onToolbarStyleChange}
          onOrientationChange={props.onOrientationChange}
        />
      );
    case 'sound':
      return (
        <RsdSoundSection
          soundEnabled={settings.soundEnabled}
          soundVolume={settings.soundVolume}
          drawingSoundEnabled={settings.drawingSoundEnabled}
          deleteSoundEnabled={settings.deleteSoundEnabled}
          busy={busy}
          onToggle={props.onToggle}
          onVolumeChange={props.onSoundVolumeChange}
          onDrawingSoundChange={props.onDrawingSoundChange}
          onDeleteSoundChange={props.onDeleteSoundChange}
        />
      );
    case 'controls':
      return <ToolDrawerChoices {...props} />;
    case 'accessibility':
      return (
        <RsdAccessibilitySection
          buttonScale={props.buttonScale}
          busy={busy}
          onReduceMotionChange={props.onReduceMotionChange}
        />
      );
    case 'coloring':
      return (
        <RsdColoringSection
          enabled={settings.coloringBookEnabled}
          busy={busy}
          onColoringBookChange={onColoringBookChange}
        />
      );
    // Feedback opens its own sheet from the hub, and AI Art has no native section body yet.
    case 'ai':
    case 'feedback':
      return null;
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

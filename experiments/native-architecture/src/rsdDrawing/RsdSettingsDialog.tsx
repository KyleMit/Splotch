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
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';
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
import { RsdWhatsNewSection } from './RsdWhatsNewSection';
import { RsdParentCenterLock } from './RsdParentCenterLock';
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
  onSoundLevelChange: (level: SoundLevel) => void;
  onAppearanceChange: (appearance: AppearancePreference) => void;
  onOrientationChange: (orientation: OrientationChoice) => void;
  onColoringBookChange: (enabled: boolean) => void;
  onButtonScaleChange: (scale: number) => void;
  onReduceMotionChange: (preference: ReduceMotionPreference) => void;
  onWhatsNewSeen: () => void;
  onRetry: () => void;
  onClose: () => void;
  parentCenter: ParentCenterRoute;
  // The Grown-Ups Only card, held over Settings while a check raised from it is open.
  gate: ReactNode;
  onFeedback: () => void;
  downloadedBooks: number;
  ai: SectionSummaryContext['ai'];
  visible?: boolean;
  onDismiss?: () => void;
};

// Parent Center's controls are themselves a gated operation: the section opens only once a check is
// solved, and leaving it locks them again.
type ParentCenterRoute = {
  unlocked: boolean;
  // Whether opening Parent Center asks for a check now; when it does not, the controls are as
  // good as unlocked (shipping WideShell's parentCenterRevealed).
  checkDue: boolean;
  onUnlock: () => void;
  onLeave: () => void;
  section: ReactNode;
};

type SettingsPage =
  | { kind: 'hub'; returnTo: NativeSettingsSectionId | null }
  | { kind: 'section'; section: NativeSettingsSectionId }
  | { kind: 'information'; page: InformationPage };

const HUB: SettingsPage = { kind: 'hub', returnTo: null };
const PARENT_CENTER_PAGE: SettingsPage = { kind: 'section', section: 'parentCenter' };
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
  const shell = settingsShell(useWindowDimensions());
  const { unlocked } = props.parentCenter;
  const [page, setPage] = useState<SettingsPage>(unlocked ? PARENT_CENTER_PAGE : HUB);
  const sectionTitle = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (page.kind === 'section') landFocus(sectionTitle.current);
  }, [page]);
  useEffect(() => {
    if (unlocked) setPage((current) => (isParentCenter(current) ? current : PARENT_CENTER_PAGE));
  }, [unlocked]);
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
    if (section === 'parentCenter' && !unlocked) {
      props.parentCenter.onUnlock();
      return;
    }
    if (section === 'whatsnew') onWhatsNewSeen();
    setPage({ kind: 'section', section });
  };
  const back = () => {
    if (isParentCenter(page)) props.parentCenter.onLeave();
    setPage({ kind: 'hub', returnTo: page.kind === 'section' ? page.section : null });
  };
  const onHelp = () => setPage({ kind: 'information', page: 'help' });
  // Only the phone shell drills in; the others show the same sections in place.
  const subpage =
    page.kind === 'information' || (shell === 'phone' && page.kind === 'section') ? page : null;
  const status = (
    <>
      {settings.status === 'saving' ? <html.span>Saving settings…</html.span> : null}
      {notice ? <html.span aria-live="polite">{notice}</html.span> : null}
      {settings.status === 'ready' && !settings.saved ? (
        <RsdAction label="Try saving settings again" onClick={onRetry} />
      ) : null}
    </>
  );
  return (
    <ModalShell
      visible={visible}
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
          unseen={unseen}
          renderSection={(section) => (
            <SettingsSection {...props} section={section} busy={busy} onHelp={onHelp} />
          )}
          onSeen={(section) => {
            if (section === 'whatsnew') onWhatsNewSeen();
          }}
          onFeedback={props.onFeedback}
          locked={parentCenterRevealed(props.parentCenter) ? null : 'parentCenter'}
          onUnlock={props.parentCenter.onUnlock}
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
      {props.gate}
    </ModalShell>
  );
}

function parentCenterRevealed({ unlocked, checkDue }: ParentCenterRoute) {
  return unlocked || !checkDue;
}

function isParentCenter(page: SettingsPage) {
  return page.kind === 'section' && page.section === 'parentCenter';
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
      return parentCenterRevealed(props.parentCenter) ? (
        props.parentCenter.section
      ) : (
        <RsdParentCenterLock onUnlock={props.parentCenter.onUnlock} />
      );
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

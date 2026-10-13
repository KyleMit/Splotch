import type { OptionalBrush, BrushPreferencesState } from '../settings/brushPreferences';
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
import { RsdColoringSection } from './RsdColoringSection';
import { RsdToolDrawerSection } from './RsdToolDrawerSection';
import { RsdSavingSection } from './RsdSavingSection';
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
  onToolDrawerChange: (enabled: boolean) => void;
  onScreenshotChange: (enabled: boolean) => void;
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
  const status = <SettingsStatus settings={settings} notice={notice} onRetry={onRetry} />;
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
        >
          {status}
        </RsdSettingsWide>
      ) : shell === 'compact' ? (
        <RsdSettingsCompact
          sound={toggles.sound}
          night={toggles.appearance}
          toolDrawer={{
            checked: settings.toolDrawerEnabled,
            disabled: busy,
            onToggle: props.onToolDrawerChange,
          }}
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

function SettingsStatus({
  settings,
  notice,
  onRetry,
}: Pick<NativeSoundSettingsDialogProps, 'settings' | 'notice' | 'onRetry'>) {
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
      return <AppearanceChoices {...props} />;
    case 'sound':
      return <SoundChoices {...props} />;
    case 'controls':
      return (
        <RsdToolDrawerSection
          settings={settings}
          brushState={props.brushState}
          busy={busy}
          onToolDrawerChange={props.onToolDrawerChange}
          onBrushAvailabilityChange={props.onBrushAvailabilityChange}
          onUndoButtonChange={props.onUndoButtonChange}
          onStrokeWidthControlChange={props.onStrokeWidthControlChange}
          onPencilEraserChange={props.onPencilEraserChange}
          onRetryBrushSave={props.onRetryBrushSave}
        />
      );
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
      return (
        <RsdSavingSection
          screenshotEnabled={settings.screenshotEnabled}
          saveOnDeleteEnabled={settings.saveOnDeleteEnabled}
          busy={busy}
          onScreenshotChange={props.onScreenshotChange}
          onSaveOnDeleteChange={props.onSaveOnDeleteChange}
        />
      );
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

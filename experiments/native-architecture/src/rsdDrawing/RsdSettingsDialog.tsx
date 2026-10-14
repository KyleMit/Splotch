import type { OptionalBrush, BrushPreferencesState } from '../settings/brushPreferences';
import type { AppearancePreference } from '../settings/appearance';
import { html } from 'react-strict-dom';
import type { SoundSettingsState } from '../settings/soundSettings';
import type { ToolbarStyle } from '../settings/toolbarStyle';
import { RsdAction, styles as controlStyles } from './controls';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';
import { RsdInstallGuide } from './RsdInstallGuide';
import { RsdAboutSection } from './RsdAboutSection';
import { RsdFeedbackSection } from './RsdFeedbackSection';
import type { NativeFeedbackOwner } from '../feedback/feedback';
import type { HostedPage } from '../settings/hostedPages';
import type { OrientationChoice } from '../settings/orientation';
import type { ReduceMotionPreference } from '../settings/reduceMotion';
import {
  NATIVE_SETTINGS_SECTIONS,
  sectionHeading,
  type NativeSettingsSectionId,
  type SectionSummaryContext,
} from '../settings/settingsSections';
import { RsdSettingsHub, useHubToggles, useSectionActivity } from './RsdSettingsHub';
import { RsdSettingsWide } from './RsdSettingsWide';
import { RsdSettingsCompact } from './RsdSettingsCompact';
import { RsdScrollCue } from './RsdScrollCue';
import { useDialogBody, useDialogSeeThrough } from './dialogScope';
import { settingsShell } from './modalGeometry';
import { RsdAccessibilitySection } from './RsdAccessibilitySection';
import { RsdAppearanceSection } from './RsdAppearanceSection';
import { RsdSoundSection } from './RsdSoundSection';
import type { SliderDraft } from './useSliderDraft';
import { RsdWhatsNewSection } from './RsdWhatsNewSection';
import { RsdParentCenterLock } from './RsdParentCenterLock';
import { RsdColoringSection } from './RsdColoringSection';
import { RsdToolDrawerSection } from './RsdToolDrawerSection';
import { RsdSavingSection } from './RsdSavingSection';
import { RsdAiSettingsSection, type AiSettingsRoute } from './RsdAiSettingsSection';
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
  onDrawingSoundChange: (enabled: boolean) => void;
  onDeleteSoundChange: (enabled: boolean) => void;
  onAppearanceChange: (appearance: AppearancePreference) => void;
  onToolbarStyleChange: (style: ToolbarStyle) => void;
  onOrientationChange: (orientation: OrientationChoice) => void;
  onColoringBookChange: (enabled: boolean) => void;
  onAiCustomizationChange: (enabled: boolean) => void;
  onAutoSaveAiChange: (enabled: boolean) => void;
  // Lifted to the drawing screen, whose edge controls preview the size while it is dragged.
  buttonScale: SliderDraft;
  // Lifted to the drawing screen with the audio owner it previews through.
  soundVolume: SliderDraft;
  onReduceMotionChange: (preference: ReduceMotionPreference) => void;
  onWhatsNewSeen: () => void;
  onRetry: () => void;
  onClose: () => void;
  parentCenter: ParentCenterRoute;
  // The Grown-Ups Only card, held over Settings while a check raised from it is open.
  gate: ReactNode;
  feedback: NativeFeedbackOwner | null;
  // Opens a page outside the app; the route holds it behind the external-links check.
  onOpenHostedPage: (page: HostedPage) => void;
  downloadedBooks: number;
  ai: AiSettingsRoute;
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
  | { kind: 'section'; section: NativeSettingsSectionId };

const HUB: SettingsPage = { kind: 'hub', returnTo: null };
const PARENT_CENTER_PAGE: SettingsPage = { kind: 'section', section: 'parentCenter' };

function pageLabel(page: SettingsPage) {
  return page.kind === 'section' ? sectionHeading(page.section) : 'Settings';
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
  const { page, setPage, sectionTitle } = useSettingsPage(unlocked);
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
    ai: props.ai.state,
  };
  const unseen = useSectionActivity(context);
  const openSection = (section: NativeSettingsSectionId) => {
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
  // Only the phone shell drills in; the others show the same sections in place.
  const subpage = shell === 'phone' && page.kind === 'section' ? page : null;
  const status = <SaveStatus settings={settings} notice={notice} onRetry={onRetry} />;
  return (
    <ModalShell
      visible={visible}
      seeThrough={props.buttonScale.active}
      onDismiss={onDismiss}
      label={pageLabel(subpage ?? HUB)}
      size={subpage?.section === 'ai' ? 'aiSettings' : 'settings'}
      onClose={subpage ? back : onClose}
      scrolls={false}
      header={
        subpage ? (
          <DialogHeader
            title={pageLabel(subpage)}
            titleSize="lg"
            titleRef={sectionTitle}
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
      {subpage ? (
        <PhoneScroll>
          <SettingsSection {...props} section={subpage.section} busy={busy} wide={false} />
          {status}
        </PhoneScroll>
      ) : shell === 'wide' ? (
        <RsdSettingsWide
          sections={NATIVE_SETTINGS_SECTIONS}
          keptSection={props.buttonScale.active ? 'accessibility' : null}
          unseen={unseen}
          renderSection={(section) => (
            <SettingsSection {...props} section={section} busy={busy} wide />
          )}
          onSeen={(section) => {
            if (section === 'whatsnew') onWhatsNewSeen();
          }}
          locked={parentCenterRevealed(props.parentCenter) ? null : 'parentCenter'}
          landing={unlocked ? 'parentCenter' : null}
          onUnlock={props.parentCenter.onUnlock}
        >
          {status}
        </RsdSettingsWide>
      ) : shell === 'compact' ? (
        <CompactSettings {...props} toggles={toggles} busy={busy}>
          {status}
        </CompactSettings>
      ) : (
        <PhoneScroll>
          <RsdSettingsHub
            sections={NATIVE_SETTINGS_SECTIONS}
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

// The landscape-phone quick toggles: the hub's Sound and Night Mode switches, the Tool Drawer
// switch and the orientation lock.
function CompactSettings({
  settings,
  toggles,
  busy,
  onToolDrawerChange,
  onOrientationChange,
  children,
}: NativeSoundSettingsDialogProps & {
  toggles: ReturnType<typeof useHubToggles>;
  busy: boolean;
  children: ReactNode;
}) {
  return (
    <RsdSettingsCompact
      sound={toggles.sound}
      night={toggles.appearance}
      toolDrawer={{
        checked: settings.toolDrawerEnabled,
        disabled: busy,
        onToggle: onToolDrawerChange,
      }}
      orientation={settings.orientation}
      busy={busy}
      onOrientationChange={onOrientationChange}
    >
      {children}
    </RsdSettingsCompact>
  );
}

function SaveStatus({
  settings,
  notice,
  onRetry,
}: Pick<NativeSoundSettingsDialogProps, 'settings' | 'notice' | 'onRetry'>) {
  // A see-through dialog shows only the control being dragged.
  if (useDialogSeeThrough()) return null;
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

// The page the phone shell shows. A solved Parent Center check lands on its section wherever it
// was raised from, and each move lands focus on the section heading that replaced the control.
function useSettingsPage(parentCenterUnlocked: boolean) {
  const [page, setPage] = useState<SettingsPage>(parentCenterUnlocked ? PARENT_CENTER_PAGE : HUB);
  const sectionTitle = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (page.kind === 'section') landFocus(sectionTitle.current);
  }, [page]);
  useEffect(() => {
    if (parentCenterUnlocked)
      setPage((current) => (isParentCenter(current) ? current : PARENT_CENTER_PAGE));
  }, [parentCenterUnlocked]);
  return { page, setPage, sectionTitle };
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
  // The wide pane titles each section one heading level below the phone page's title.
  wide: boolean;
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
          volume={props.soundVolume}
          drawingSoundEnabled={settings.drawingSoundEnabled}
          deleteSoundEnabled={settings.deleteSoundEnabled}
          busy={busy}
          onToggle={props.onToggle}
          onDrawingSoundChange={props.onDrawingSoundChange}
          onDeleteSoundChange={props.onDeleteSoundChange}
        />
      );
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
    case 'ai':
      return (
        <RsdAiSettingsSection
          settings={settings}
          busy={busy}
          ai={props.ai}
          onAiCustomizationChange={props.onAiCustomizationChange}
          onAutoSaveAiChange={props.onAutoSaveAiChange}
        />
      );
    case 'feedback':
      return <RsdFeedbackSection owner={props.feedback} />;
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
      return parentCenterRevealed(props.parentCenter) ? (
        props.parentCenter.section
      ) : (
        <RsdParentCenterLock onUnlock={props.parentCenter.onUnlock} />
      );
    case 'setup':
      return <RsdInstallGuide />;
    case 'whatsnew':
      return (
        <RsdWhatsNewSection
          sectionHeadingLevel={props.wide ? 3 : 2}
          onOpen={props.onOpenHostedPage}
        />
      );
    case 'about':
      return <RsdAboutSection onOpen={props.onOpenHostedPage} />;
  }
}

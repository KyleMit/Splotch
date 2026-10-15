import { useEffect, type ReactNode } from 'react';
import type { useDrawingProduct } from '../product/useDrawingProduct';
import type { DrawingProductOwner } from '../product/createDrawingProduct';
import type { useDrawingScreen } from '../useDrawingScreen';
import type { useDrawingSound } from '../useDrawingSound';
import { NativeSoundSettingsDialog } from './RsdSettingsDialog';
import { RsdParentCenterSection } from './RsdParentCenterSection';
// The gate's own lazy chunk on web, which the drawing screen also shows it from: a direct import
// would put it in two lazy chunks, which Expo hoists into the startup chunk.
import { RsdParentGateSheet } from './drawingSheets';
import { useModalPresence } from './useModalPresence';
import type { ParentGateView } from '../parentCenter/useParentGateCard';
import { soundSettingsActions } from './soundSettingsActions';
import type { SliderDraft } from './useSliderDraft';
import { openAppPage } from '../platform/appPath';
import { openHostedPage, type SettingsLink } from '../settings/hostedPages';

// Privacy and release history stay in the app. External destinations open inside the solving
// tap so the web export keeps the user activation required for a new tab.
function openSettingsLink(owner: DrawingProductOwner | null, page: SettingsLink) {
  if (page === 'privacy' || page === 'changelog') {
    openAppPage(page);
    return;
  }
  owner?.port.request(
    'externalLinks',
    (proof) => {
      if (proof.valid()) openHostedPage(page);
    },
    { immediate: true }
  );
}

// Settings wired to the drawing screen's owners. Its own module so the wiring loads with the
// dialog's chunk rather than on the startup path.
export function RsdSettingsRoute({
  screen,
  sound,
  product,
  gate,
  notice,
  buttonScale,
  scaleCeiling,
  soundVolume,
  visible,
  onDismiss,
  informationPage,
}: {
  screen: ReturnType<typeof useDrawingScreen>;
  sound: ReturnType<typeof useDrawingSound>;
  product: ReturnType<typeof useDrawingProduct>;
  gate: ParentGateView | null;
  notice: string;
  buttonScale: SliderDraft;
  scaleCeiling: number;
  soundVolume: SliderDraft;
  visible: boolean;
  onDismiss: () => void;
  informationPage?: ReactNode;
}) {
  const owner = product.owner;
  const aiOwner = product.ai.owner;
  const aiEnabled = sound.settings.aiEnabled;
  const gateCard = useModalPresence(gate?.open ? gate : null);
  // The AI Art row and section say which credential is saved and how many free creations are
  // left, as shipping's do, so Settings reads both whenever it opens and whenever AI turns on.
  useEffect(() => {
    if (visible) void aiOwner?.inspect();
  }, [visible, aiOwner, aiEnabled]);
  const close = () => {
    owner?.closeParentCenter();
    screen.closeSettings();
  };
  return (
    <NativeSoundSettingsDialog
      settings={sound.settings}
      brushState={screen.brushPreferences}
      onBrushAvailabilityChange={screen.setBrushAvailable}
      onRetryBrushSave={screen.retryBrushSave}
      notice={notice}
      {...soundSettingsActions(sound)}
      buttonScale={buttonScale}
      scaleCeiling={scaleCeiling}
      soundVolume={soundVolume}
      onClose={close}
      initialSection={screen.settingsSection}
      visible={visible}
      onDismiss={onDismiss}
      informationPage={informationPage}
      parentCenter={{
        unlocked: product.state?.parentCenterOpen === true,
        checkDue: product.state?.parentCenterCheckDue !== false,
        onUnlock: () => owner?.openParentCenter(),
        onLeave: () => owner?.closeParentCenter(),
        section: owner ? <RsdParentCenterSection owner={owner} /> : null,
      }}
      gate={
        owner && gateCard.shown ? (
          <RsdParentGateSheet
            owner={owner}
            state={gateCard.shown.state}
            unlocked={gateCard.shown.unlocked}
            visible={gateCard.visible}
            onDismiss={gateCard.dismissed}
          />
        ) : null
      }
      feedback={product.feedback.owner}
      onOpenPage={(page) => openSettingsLink(owner, page)}
      downloadedBooks={screen.library.state.installed.length}
      ai={{
        owner: aiOwner,
        state: product.ai.state,
        onToggle: (enabled) => void owner?.setAiEnabled(enabled),
        saveFailed: owner?.settings.aiSaveFailed() ?? false,
        onRetrySave: () => void owner?.settings.retryAiSave(),
        onOpenKeysPage: () => openSettingsLink(owner, 'openAiKeys'),
      }}
    />
  );
}

export { RsdReleaseHistory, RsdLatestReleaseLabel } from './RsdReleaseHistory';

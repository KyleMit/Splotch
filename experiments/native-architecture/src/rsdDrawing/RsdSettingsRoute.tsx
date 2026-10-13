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
import type { ParentGateView } from '../parentCenter/useParentGateHold';
import { soundSettingsActions } from './soundSettingsActions';
import { openHostedPage, type HostedPage } from '../settings/hostedPages';

// Every Settings link leaves the app, so each opens only through Parent Center's Viewing external
// links check, as shipping's parentalGateLink does. The page opens inside the solving tap, which
// keeps a web export's new tab within that tap's user activation; with no owner, nothing opens.
function openOutside(owner: DrawingProductOwner | null, page: HostedPage) {
  owner?.port.request('externalLinks', (proof) => {
    if (proof.valid()) openHostedPage(page);
  });
}

// Settings wired to the drawing screen's owners. Its own module so the wiring loads with the
// dialog's chunk rather than on the startup path.
export function RsdSettingsRoute({
  screen,
  sound,
  product,
  gate,
  notice,
  visible,
  onDismiss,
}: {
  screen: ReturnType<typeof useDrawingScreen>;
  sound: ReturnType<typeof useDrawingSound>;
  product: ReturnType<typeof useDrawingProduct>;
  gate: ParentGateView | null;
  notice: string;
  visible: boolean;
  onDismiss: () => void;
}) {
  const owner = product.owner;
  const gateCard = useModalPresence(gate?.open ? gate : null);
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
      onClose={close}
      visible={visible}
      onDismiss={onDismiss}
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
      onOpenHostedPage={(page) => openOutside(owner, page)}
      downloadedBooks={screen.library.state.installed.length}
      ai={product.ai.state}
    />
  );
}

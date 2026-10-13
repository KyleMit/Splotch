import type { useDrawingProduct } from '../product/useDrawingProduct';
import type { useDrawingScreen } from '../useDrawingScreen';
import type { useDrawingSound } from '../useDrawingSound';
import { NativeSoundSettingsDialog } from './RsdSettingsDialog';
import { soundSettingsActions } from './soundSettingsActions';
import { openHostedPage, type HostedPage } from '../settings/hostedPages';

// Every Settings link leaves the app. Shipping holds each behind Parent Center's Viewing external
// links check (parentalGateLink.ts), which PARENT_FEATURES does not carry, so this is the one place
// that check wraps: the sections open pages only through it.
function openOutside(page: HostedPage) {
  openHostedPage(page);
}

// Settings wired to the drawing screen's owners. Its own module so the wiring loads with the
// dialog's chunk rather than on the startup path.
export function RsdSettingsRoute({
  screen,
  sound,
  product,
  notice,
  visible,
  onDismiss,
}: {
  screen: ReturnType<typeof useDrawingScreen>;
  sound: ReturnType<typeof useDrawingSound>;
  product: ReturnType<typeof useDrawingProduct>;
  notice: string;
  visible: boolean;
  onDismiss: () => void;
}) {
  return (
    <NativeSoundSettingsDialog
      settings={sound.settings}
      brushState={screen.brushPreferences}
      onBrushAvailabilityChange={screen.setBrushAvailable}
      onRetryBrushSave={screen.retryBrushSave}
      notice={notice}
      {...soundSettingsActions(sound)}
      onClose={screen.closeSettings}
      visible={visible}
      onDismiss={onDismiss}
      onParentCenter={() => product.owner?.openParentCenter()}
      feedback={product.feedback.owner}
      onOpenHostedPage={openOutside}
      downloadedBooks={screen.library.state.installed.length}
      ai={product.ai.state}
    />
  );
}

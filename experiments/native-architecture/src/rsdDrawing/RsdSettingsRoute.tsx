import type { useDrawingProduct } from '../product/useDrawingProduct';
import type { useDrawingScreen } from '../useDrawingScreen';
import type { useDrawingSound } from '../useDrawingSound';
import { NativeSoundSettingsDialog } from './RsdSettingsDialog';
import { soundSettingsActions } from './soundSettingsActions';
import type { SliderDraft } from './useSliderDraft';

// Settings wired to the drawing screen's owners. Its own module so the wiring loads with the
// dialog's chunk rather than on the startup path.
export function RsdSettingsRoute({
  screen,
  sound,
  product,
  notice,
  buttonScale,
  visible,
  onDismiss,
}: {
  screen: ReturnType<typeof useDrawingScreen>;
  sound: ReturnType<typeof useDrawingSound>;
  product: ReturnType<typeof useDrawingProduct>;
  notice: string;
  buttonScale: SliderDraft;
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
      buttonScale={buttonScale}
      onClose={screen.closeSettings}
      visible={visible}
      onDismiss={onDismiss}
      onParentCenter={() => product.owner?.openParentCenter()}
      onFeedback={() => {
        screen.closeSettings();
        product.feedback.owner?.open();
      }}
      downloadedBooks={screen.library.state.installed.length}
      ai={product.ai.state}
    />
  );
}

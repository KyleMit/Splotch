import { useEffect, useRef, useState } from 'react';
import { saveFailureCopy } from '../export/pictureSave';
import { saveOs } from '../keepPicture';
import { useDraftNotice } from '../product/useDraftNotice';
import type { useDrawingScreen } from '../useDrawingScreen';
import { RsdFailureBanner } from './drawingSheets';
import type { FailureBannerAction, FailureBannerModel } from './RsdFailureBanner';
import { RsdSurfaceBoundary } from './RsdSurfaceBoundary';
import { RsdVisuallyHidden } from './RsdVisuallyHidden';

type Screen = ReturnType<typeof useDrawingScreen>;

// A live region is silent when its words do not change, and a Try again that fails again leaves
// them exactly as they were, so the region is emptied and rewritten this long later
// (SaveFailureBanner.svelte's REANNOUNCE_GAP_MS; rsd-native-save-flight.test.mjs reads it back).
export const FAILURE_REANNOUNCE_GAP_MS = 150;

// Shipping's generic failure heading; a refused save brings its own.
export const FAILURE_HEADING = 'Something went wrong';
// Words for a renderer fault whose error has already given way to a later notice.
const RENDERER_FAILURE_DETAIL = 'Your picture is still here. Try again to show it.';

function retryAction(label: string, disabled: boolean, onPress: () => void): FailureBannerAction {
  return { id: 'retry', label, variant: 'brand', busy: false, disabled, onPress };
}

// SaveFailureBanner.svelte: Open Settings where a native save was refused for a permission, behind
// the parental gate since Settings is outside the app, and Try again for the pictures it holds.
function saveBanner(
  { saveFailure }: Screen,
  openAppSettings: (() => void) | null
): FailureBannerModel | null {
  if (!saveFailure.outcome) return null;
  const os = saveOs();
  const copy = saveFailureCopy(saveFailure.outcome, saveFailure.pictureCount, os);
  const actions: FailureBannerAction[] = [];
  const offerSettings = saveFailure.outcome === 'denied' && os !== 'web' && openAppSettings;
  if (offerSettings)
    actions.push({
      id: 'settings',
      label: 'Open Settings',
      variant: 'brand',
      busy: false,
      disabled: false,
      onPress: offerSettings,
    });
  if (saveFailure.pictureCount > 0)
    actions.push({
      id: 'retry',
      label: saveFailure.retrying ? 'Saving…' : 'Try again',
      variant: offerSettings ? 'wash' : 'brand',
      busy: saveFailure.retrying,
      disabled: false,
      onPress: () => void saveFailure.retry(),
    });
  return { key: 'save', ...copy, onDismiss: saveFailure.dismiss, actions };
}

// Failures, by type, in the order the banner stacks them. A renderer fault's error is the one
// `screen.failure` holds, so it shows once, with the Retry that clears it. A minimized AI run's
// waiting polaroid owns the top of the paper and is the way back to a picture already paid for,
// so the Save Failure Banner waits for it (SaveFailureBanner.svelte).
function failureBanners(
  screen: Screen,
  draft: ReturnType<typeof useDraftNotice>,
  saving: Readonly<{ openAppSettings: (() => void) | null; aiMinimized: boolean }>
): FailureBannerModel[] {
  const banners: FailureBannerModel[] = [];
  const { failure, recovery } = screen;
  if (recovery.failed)
    banners.push({
      key: 'renderer',
      heading: FAILURE_HEADING,
      detail: failure?.kind === 'error' ? failure.detail : RENDERER_FAILURE_DETAIL,
      onDismiss: null,
      actions: [retryAction('Retry drawing', recovery.retryDisabled, recovery.retry)],
    });
  if (draft.state.status === 'failed')
    banners.push({
      key: 'draft',
      heading: FAILURE_HEADING,
      detail: draft.state.message,
      onDismiss: null,
      actions: [retryAction('Retry draft recovery', draft.disabled, draft.retry)],
    });
  const save = saving.aiMinimized ? null : saveBanner(screen, saving.openAppSettings);
  if (save) banners.push(save);
  if (failure && !recovery.failed)
    banners.push({
      key: failure.kind,
      heading: FAILURE_HEADING,
      detail: failure.detail,
      onDismiss: screen.dismissFailure,
      actions: [],
    });
  return banners;
}

function useFailureAnnouncement(message: string, retrying: boolean) {
  const [cleared, setCleared] = useState(false);
  const wasRetrying = useRef(retrying);
  const lastMessage = useRef(message);
  useEffect(() => {
    const settled = wasRetrying.current && !retrying;
    const repeated = message !== '' && message === lastMessage.current;
    wasRetrying.current = retrying;
    lastMessage.current = message;
    if (!settled || !repeated) return;
    setCleared(true);
    const timer = setTimeout(() => setCleared(false), FAILURE_REANNOUNCE_GAP_MS);
    return () => {
      clearTimeout(timer);
      setCleared(false);
    };
  }, [message, retrying]);
  return cleared ? '' : message;
}

// Shipping shows no status text on the paper. Routine notices are spoken from a visually hidden
// polite region; failures show in the Save Failure Banner, whose words a second region, mounted
// before any failure, speaks. Each failure is spoken there once: the screen's routine notice
// leaves out any notice a failure wrote, and a failed draft's words are the banner's.
export function RsdDrawingStatus({
  screen,
  notice,
  soundNotice,
  blocked,
  openAppSettings,
  aiMinimized,
}: {
  screen: Screen;
  notice: string;
  soundNotice: string;
  blocked: boolean;
  openAppSettings: (() => void) | null;
  aiMinimized: boolean;
}) {
  const draft = useDraftNotice(screen, blocked);
  const banners = failureBanners(screen, draft, { openAppSettings, aiMinimized });
  // The banner stays mounted after its last failure leaves, so that failure's exit can play.
  const [bannerUsed, setBannerUsed] = useState(false);
  if (banners.length > 0 && !bannerUsed) setBannerUsed(true);
  const announcement = useFailureAnnouncement(
    banners.map(({ heading, detail }) => `${heading}. ${detail}`).join(' '),
    screen.saveFailure.retrying
  );
  const routine = [notice, soundNotice, draft.state.status === 'failed' ? '' : draft.state.message];
  return (
    <>
      <RsdVisuallyHidden live>{routine.filter(Boolean).join(' ')}</RsdVisuallyHidden>
      <RsdVisuallyHidden live>{announcement}</RsdVisuallyHidden>
      {bannerUsed ? (
        <RsdSurfaceBoundary>
          <RsdFailureBanner failures={banners} />
        </RsdSurfaceBoundary>
      ) : null}
    </>
  );
}

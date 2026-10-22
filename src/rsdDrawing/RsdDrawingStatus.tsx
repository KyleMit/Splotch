import { useEffect, useRef, useState } from 'react';
import { saveFailureCopy } from '../export/pictureSave';
import { saveOs } from '../keepPicture';
import type { useDrawingScreen } from '../useDrawingScreen';
import { RsdFailureBanner } from './drawingSheets';
import type { FailureBannerAction, FailureBannerModel } from './RsdFailureBanner';
import { RsdSurfaceBoundary } from './RsdSurfaceBoundary';
import { RsdVisuallyHidden } from './RsdVisuallyHidden';

type Screen = ReturnType<typeof useDrawingScreen>;

// A live region is silent when its words do not change, and a Try again that fails again leaves
// them exactly as they were, so the region is emptied and rewritten this long later
// (SaveFailureBanner.svelte's REANNOUNCE_GAP_MS; rsd-native-save-flight.test.mjs reads it back).
const FAILURE_REANNOUNCE_GAP_MS = 150;

// Shipping's generic failure heading; a refused save brings its own.
const FAILURE_HEADING = 'Something went wrong';
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

// Failures, by type, in the order the banner stacks them. A renderer fault shows on the Error
// Screen instead, so the error `screen.failure` holds for it stays off the banner. A minimized AI run's
// waiting polaroid owns the top of the paper and is the way back to a picture already paid for,
// so the Save Failure Banner waits for it (SaveFailureBanner.svelte).
function failureBanners(
  screen: Screen,
  saving: Readonly<{ openAppSettings: (() => void) | null; aiMinimized: boolean }>
): FailureBannerModel[] {
  const banners: FailureBannerModel[] = [];
  const { failure, recovery } = screen;
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
// leaves out any notice a failure wrote.
export function RsdDrawingStatus({
  screen,
  notice,
  soundNotice,
  openAppSettings,
  aiMinimized,
}: {
  screen: Screen;
  notice: string;
  soundNotice: string;
  openAppSettings: (() => void) | null;
  aiMinimized: boolean;
}) {
  const banners = failureBanners(screen, { openAppSettings, aiMinimized });
  // The banner stays mounted after its last failure leaves, so that failure's exit can play.
  const [bannerUsed, setBannerUsed] = useState(false);
  if (banners.length > 0 && !bannerUsed) setBannerUsed(true);
  const announcement = useFailureAnnouncement(
    banners.map(({ heading, detail }) => `${heading}. ${detail}`).join(' '),
    screen.saveFailure.retrying
  );
  const routine = [notice, soundNotice];
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

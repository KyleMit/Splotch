import { scheduleIdle } from '$lib/idle';
import { webColoringPackStorageExists } from '$lib/coloringPacks/cacheKeys';
import { COLORING_PACK_POLICY_EVENT } from '$lib/coloringPacks/policy';
import { isNative } from '$lib/platform';
import { setNoDownloadedColoringBooks } from '$lib/state/coloringPacks.svelte';
import { settings } from '$lib/state/settings.svelte';

export interface ColoringPackDownloads {
  // The child has engaged: a few strokes, or the coloring picker opened. Safe
  // to call repeatedly, and before settings have recovered.
  engage(): void;
  stop(): void;
}

// A web device's first coloring-pack downloads wait for the child to engage,
// mirroring the service worker's registration (issue #462): a bounce visit
// otherwise pays for every book before anyone draws. A device that
// already holds pack storage engaged on an earlier visit, so it resumes and
// takes updates at idle as before, as the service worker re-registers on a
// repeat visit. Native keeps installing at boot through WorkManager and the
// background URLSession, which ADR-0103 hands the transfer to.
function waitsForEngagement(): boolean {
  return !(__IS_CAPACITOR__ && isNative());
}

export function installColoringPackDownloads(
  settingsReady: Promise<unknown>
): ColoringPackDownloads {
  let cancelIdle: (() => void) | undefined;
  let checkingStorage = false;
  let startingDownloader = false;
  let stopDownloader: (() => void) | undefined;
  let engaged = false;
  let heldForEngagement = false;
  let stopped = false;

  const alreadyScheduledOrOff = () =>
    stopped ||
    cancelIdle !== undefined ||
    checkingStorage ||
    startingDownloader ||
    stopDownloader !== undefined ||
    !settings.coloringBookEnabled;

  const startDownloadManagerAtIdle = () => {
    cancelIdle = scheduleIdle(() => {
      cancelIdle = undefined;
      startingDownloader = true;
      void import('$lib/coloringPacks/manager').then(
        ({ createColoringPackDownloader }) => {
          startingDownloader = false;
          if (stopped || !settings.coloringBookEnabled) return;
          const downloader = createColoringPackDownloader();
          downloader.start();
          stopDownloader = downloader.stop;
        },
        () => {
          startingDownloader = false;
        }
      );
    });
  };

  // Without pack storage there is nothing to scan, so that answer is published
  // before the manager loads: a picker opened on a first visit shows the
  // starter book without waiting on the manifest request.
  const scheduleDownloadManager = () => {
    if (alreadyScheduledOrOff()) return;
    if (!waitsForEngagement()) {
      startDownloadManagerAtIdle();
      return;
    }
    checkingStorage = true;
    void webColoringPackStorageExists().then((hasPackStorage) => {
      checkingStorage = false;
      if (stopped || !settings.coloringBookEnabled) return;
      if (!hasPackStorage) setNoDownloadedColoringBooks('web');
      heldForEngagement = !hasPackStorage && !engaged;
      if (!heldForEngagement) startDownloadManagerAtIdle();
    });
  };

  const handlePolicyChange = () => {
    if (!settings.coloringBookEnabled) {
      cancelIdle?.();
      cancelIdle = undefined;
      return;
    }
    scheduleDownloadManager();
  };
  window.addEventListener(COLORING_PACK_POLICY_EVENT, handlePolicyChange);
  void settingsReady.then(scheduleDownloadManager, scheduleDownloadManager);

  return {
    // Engagement arrives at a stroke's end or on the picker's opening tap, and
    // the manager it releases loads at idle rather than in that frame, as the
    // service worker's registration does.
    engage() {
      if (engaged) return;
      engaged = true;
      if (!heldForEngagement) return;
      heldForEngagement = false;
      scheduleDownloadManager();
    },
    stop() {
      stopped = true;
      window.removeEventListener(COLORING_PACK_POLICY_EVENT, handlePolicyChange);
      cancelIdle?.();
      stopDownloader?.();
    },
  };
}

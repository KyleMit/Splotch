import { scheduleIdle } from '$lib/idle';
import { COLORING_PACK_POLICY_EVENT } from '$lib/coloringPacks/policy';
import { isNative } from '$lib/platform';
import { settings } from '$lib/state/settings.svelte';

export interface ColoringPackDownloads {
  // The child has engaged: a few strokes, or the coloring picker opened. Safe
  // to call repeatedly, and before settings have recovered; a later call
  // retries a manager chunk that failed to load.
  engage(): void;
  stop(): void;
}

// Bundle boundary: a copy of COLORING_PACK_CACHE_FAMILY_PREFIX in
// coloringPacks/cacheKeys.ts. Importing it would put cacheKeys on this
// startup-path module's modulepreload list, which startup-bundle.spec.ts
// forbids; coloringPacks.cacheFamilyPrefix.test.ts fails if the two drift apart.
const PACK_CACHE_FAMILY_PREFIX = 'coloring-packs-';

// Any pack cache, even an empty or half-filled one, means a visit got as far as
// downloading. An engine without Cache Storage cannot hold web packs at all.
async function webPackStorageExists(): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  const names = await caches.keys().catch((): string[] => []);
  return names.some((name) => name.startsWith(PACK_CACHE_FAMILY_PREFIX));
}

// A web device's first coloring-pack downloads wait for the child to engage,
// mirroring the service worker's registration (issue #462): a bounce visit
// otherwise pays for every book before anyone draws. A device that already
// holds pack storage engaged on an earlier visit, so it resumes and takes
// updates at idle, as a repeat visit re-registers the service worker. Native
// keeps installing at boot through WorkManager and the background URLSession
// (ADR-0103's engagement amendment says why).
function waitsForEngagement(): boolean {
  return !(__IS_CAPACITOR__ && isNative());
}

async function publishNoDownloadedBooks() {
  const { setNoDownloadedColoringBooks } = await import('$lib/state/coloringPacks.svelte');
  setNoDownloadedColoringBooks('web');
}

type ColoringPackManager = Pick<
  typeof import('$lib/coloringPacks/manager'),
  'createColoringPackDownloader'
>;

const loadColoringPackManager = (): Promise<ColoringPackManager> =>
  import('$lib/coloringPacks/manager');

export function installColoringPackDownloads(
  settingsReady: Promise<unknown>,
  // Test seam: a manager chunk that fails to load cannot be staged through the
  // module mock, which evaluates once per file.
  loadManager = loadColoringPackManager
): ColoringPackDownloads {
  let cancelIdle: (() => void) | undefined;
  let checkingStorage = false;
  let startingDownloader = false;
  let stopDownloader: (() => void) | undefined;
  let engaged = false;
  let heldForEngagement = false;
  let managerLoadFailed = false;
  let stopped = false;

  // One storage check serves every scheduling attempt this visit: a device
  // gains pack storage only through the downloader this gate releases.
  const waits = waitsForEngagement();
  const packStorageExists = waits ? webPackStorageExists() : Promise.resolve(true);

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
      void loadManager().then(
        ({ createColoringPackDownloader }) => {
          startingDownloader = false;
          if (stopped || !settings.coloringBookEnabled) return;
          const downloader = createColoringPackDownloader();
          downloader.start();
          stopDownloader = downloader.stop;
        },
        () => {
          // A failed chunk fetch (a flaky link, a deploy that retired the
          // chunk) would otherwise leave downloads off for the whole visit.
          // The next engagement or reconnect tries again.
          startingDownloader = false;
          managerLoadFailed = true;
        }
      );
    });
  };

  const scheduleDownloadManager = () => {
    if (alreadyScheduledOrOff()) return;
    managerLoadFailed = false;
    checkingStorage = true;
    void packStorageExists.then((hasPackStorage) => {
      checkingStorage = false;
      if (stopped || !settings.coloringBookEnabled) return;
      if (!hasPackStorage) publishNoDownloadedBooks().catch(() => {});
      heldForEngagement = !hasPackStorage && !engaged;
      if (!heldForEngagement) startDownloadManagerAtIdle();
    });
  };

  const retryFailedManagerLoad = () => {
    if (managerLoadFailed) scheduleDownloadManager();
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
  window.addEventListener('online', retryFailedManagerLoad);
  void settingsReady.then(scheduleDownloadManager, scheduleDownloadManager);

  return {
    // Engagement arrives at a stroke's end or on the picker's opening tap, and
    // the manager it releases loads at idle rather than in that frame, as the
    // service worker's registration does.
    engage() {
      engaged = true;
      if (heldForEngagement) {
        heldForEngagement = false;
        scheduleDownloadManager();
        return;
      }
      retryFailedManagerLoad();
    },
    stop() {
      stopped = true;
      window.removeEventListener(COLORING_PACK_POLICY_EVENT, handlePolicyChange);
      window.removeEventListener('online', retryFailedManagerLoad);
      cancelIdle?.();
      stopDownloader?.();
    },
  };
}

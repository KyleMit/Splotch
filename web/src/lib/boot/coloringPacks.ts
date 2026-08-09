import { scheduleIdle } from '$lib/idle';
import { COLORING_PACK_POLICY_EVENT } from '$lib/coloringPacks/policy';
import { settings } from '$lib/state/settings.svelte';

export function installColoringPackDownloads(settingsReady: Promise<unknown>): () => void {
  let cancelIdle: (() => void) | undefined;
  let startingDownloader = false;
  let stopDownloader: (() => void) | undefined;
  let stopped = false;

  const scheduleDownloadManager = () => {
    if (
      stopped ||
      cancelIdle ||
      startingDownloader ||
      stopDownloader ||
      !settings.coloringBookEnabled
    )
      return;
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

  return () => {
    stopped = true;
    window.removeEventListener(COLORING_PACK_POLICY_EVENT, handlePolicyChange);
    cancelIdle?.();
    stopDownloader?.();
  };
}

import { scheduleIdle } from '$lib/idle';
import { COLORING_PACK_POLICY_EVENT } from '$lib/coloringPacks/policy';
import { settings } from '$lib/state/settings.svelte';

export function installColoringPackDownloads(settingsReady: Promise<unknown>): () => void {
  let cancelIdle: (() => void) | undefined;
  let stopDownloader: (() => void) | undefined;
  let stopped = false;

  const scheduleDownloadManager = () => {
    if (stopped || cancelIdle || stopDownloader || !settings.coloringBookEnabled) return;
    cancelIdle = scheduleIdle(() => {
      cancelIdle = undefined;
      void import('$lib/coloringPacks/manager').then(({ createColoringPackDownloader }) => {
        if (stopped || !settings.coloringBookEnabled) return;
        const downloader = createColoringPackDownloader();
        downloader.start();
        stopDownloader = downloader.stop;
      });
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

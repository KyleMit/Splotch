import { scheduleIdle } from '$lib/idle';

export function installColoringPackDownloads(): () => void {
  let stopDownloader: (() => void) | undefined;
  let stopped = false;
  const cancelIdle = scheduleIdle(() => {
    void import('$lib/coloringPacks/manager').then(({ createColoringPackDownloader }) => {
      if (stopped) return;
      const downloader = createColoringPackDownloader();
      downloader.start();
      stopDownloader = downloader.stop;
    });
  });
  return () => {
    stopped = true;
    cancelIdle();
    stopDownloader?.();
  };
}

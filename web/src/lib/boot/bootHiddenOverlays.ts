import type { Component } from 'svelte';
import { scheduleIdle } from '$lib/idle';

// The boot-hidden overlays (see components/bootHiddenOverlays.ts) load and mount
// at idle so the ~470 ms first-load hydration long task doesn't pay for subtrees
// that are invisible until a tap or a few strokes later. One overlay per idle
// callback: mounting them all at once just relocates a long task to idle, where
// it would jank a stroke already in progress. SettingsModal is handed back
// separately — it's too heavy even for an idle slice and waits for its first
// open.
export function mountBootHiddenOverlays(
  onSettingsModal: (overlay: Component) => void,
  onOverlay: (overlay: Component) => void
): () => void {
  // The cancel handle scheduleIdle returns can't reach the async import().then
  // continuation below, so a `stopped` flag guards the recursive mount from
  // running after unmount.
  let stopped = false;
  scheduleIdle(() => {
    import('$lib/components/bootHiddenOverlays')
      .then((module) => {
        onSettingsModal(module.SettingsModal);
        const queue = [
          module.ColorPicker,
          module.ColoringBook,
          module.AiImagePrompt,
          module.AiImageResult,
          module.InstallBanner,
        ];
        let mounted = 0;
        const mountNext = () => {
          if (stopped) return;
          onOverlay(queue[mounted]);
          mounted += 1;
          if (mounted < queue.length) scheduleIdle(mountNext);
        };
        mountNext();
      })
      .catch((err) => {
        // A failed chunk load leaves the overlays unmounted for this session;
        // surface it rather than silently losing Settings et al.
        console.error('Boot-hidden overlay chunk failed to load:', err);
      });
  });
  return () => {
    stopped = true;
  };
}

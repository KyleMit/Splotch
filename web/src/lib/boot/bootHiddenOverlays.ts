import type { Component } from 'svelte';
import { scheduleIdle } from '$lib/idle';

// The boot-hidden overlays (see components/overlayChunk.ts) load and mount
// at idle so the ~470 ms first-load hydration long task doesn't pay for subtrees
// that are invisible until a tap or a few strokes later. One overlay per idle
// callback: mounting them all at once just relocates a long task to idle, where
// it would jank a stroke already in progress. SettingsModal is handed back
// separately: its component arrives with the chunk so a tap that beats the
// idle queue can still mount it at once, and `onSettingsPrewarm` fires as the
// queue's own final slice — the heaviest overlay mounts last, after every
// cheap one is in, and its wide pane then keeps prewarming a section per idle
// slice of its own (WideShell; ADR-0049).
export function mountBootHiddenOverlays(
  onSettingsModal: (overlay: Component) => void,
  onOverlay: (overlay: Component) => void,
  onSettingsPrewarm: () => void
): () => void {
  // The cancel handle scheduleIdle returns covers the not-yet-fired idle
  // callback; it can't reach an already-in-flight import().then continuation,
  // so a `stopped` flag also guards the mount work from running after unmount.
  let stopped = false;
  const cancelIdle = scheduleIdle(() => {
    import('$lib/components/overlayChunk')
      .then((module) => {
        if (stopped) return;
        onSettingsModal(module.SettingsModal);
        const queue = [
          module.ParentalGate,
          module.ColorPicker,
          module.ColoringBook,
          module.AiImagePrompt,
          // Before the modal it rescues: a run minimized into a gap where the
          // polaroid has not mounted yet has no way back.
          module.AiWaitingPolaroid,
          module.AiImageResult,
          module.InstallBanner,
        ];
        let mounted = 0;
        const mountNext = () => {
          if (stopped) return;
          if (mounted === queue.length) {
            onSettingsPrewarm();
            return;
          }
          onOverlay(queue[mounted]);
          mounted += 1;
          scheduleIdle(mountNext);
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
    cancelIdle();
  };
}

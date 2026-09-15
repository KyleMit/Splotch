import type { BootHiddenOverlayKey } from '$lib/boot/bootHiddenOverlays';

// The boot-hidden overlays (ADR-0049) mount on demand, and the demand belongs to
// the action that opens one — a modal's show(), a gate opening, an AI run
// starting — not to an effect watching the open flag afterwards. The drawing
// route installs its overlay controller here for the time it is mounted; on any
// other route, or before the route mounts, a demand has no controller to reach
// and is dropped, exactly as the old open-flag effects were absent there.
type OverlayDemand = (key: BootHiddenOverlayKey) => void;

export interface OverlayDemandState {
  demandOverlay(key: BootHiddenOverlayKey): void;
  // Returns the uninstall; a later install replaces an earlier one, and an
  // uninstall only clears the controller it installed.
  installOverlayDemand(demand: OverlayDemand): () => void;
}

export function createOverlayDemand(): OverlayDemandState {
  let controller: OverlayDemand | null = null;
  return {
    demandOverlay(key) {
      controller?.(key);
    },
    installOverlayDemand(demand) {
      controller = demand;
      return () => {
        if (controller === demand) controller = null;
      };
    },
  };
}

const overlayDemand = createOverlayDemand();

export const { demandOverlay, installOverlayDemand } = overlayDemand;

import type { BootHiddenOverlayKey } from '$lib/boot/bootHiddenOverlays';
import { demandOverlay } from './overlayDemand';

// Screen-space point a modal animates out from (the tapped button's center).
export interface Origin {
  x: number;
  y: number;
}

export interface Modal {
  readonly open: boolean;
  readonly origin: Origin | null;
  show(origin: Origin | null): void;
  hide(): void;
}

export function buttonCenter(el: HTMLElement): Origin {
  const rect = el.getBoundingClientRect();
  return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
}

// `overlayKey` names the boot-hidden overlay that renders this modal, so showing
// it is what asks the drawing route to mount that overlay (ADR-0049).
export function createModal(overlayKey?: BootHiddenOverlayKey): Modal {
  const s = $state<{ open: boolean; origin: Origin | null }>({ open: false, origin: null });
  return {
    get open() {
      return s.open;
    },
    get origin() {
      return s.origin;
    },
    show(origin) {
      s.origin = origin;
      s.open = true;
      if (overlayKey) demandOverlay(overlayKey);
    },
    hide() {
      s.open = false;
    },
  };
}

import { drawerToolId } from '../rsdDrawing/drawerToolId';

const LAUNCHERS = [`#${drawerToolId('ai')} button`, '[data-testid="rsd-drawer-dock"] button'];

// Shipping's returnFocusToLauncher (AiImageResult.svelte): a closing result card leaves focus on
// <body>, so it lands on the AI button that is the way back in; a folded drawer hides that button,
// and focus() on a hidden control does nothing, so the drawer toggle that reveals it takes focus
// instead. Focus anywhere else is left alone. It runs a frame after the card leaves the page.
export function returnFocusToAiLauncher() {
  requestAnimationFrame(() => {
    for (const selector of LAUNCHERS) {
      if (document.activeElement && document.activeElement !== document.body) return;
      document.querySelector<HTMLElement>(selector)?.focus();
    }
  });
}

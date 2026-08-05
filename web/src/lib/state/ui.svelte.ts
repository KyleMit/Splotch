import { createModal } from './modal.svelte';
import type { Origin } from './modal.svelte';

export interface UiState {
  // True while the parent is dragging the button-size slider. Settings
  // hides everything but the slider so the live-resizing action buttons show.
  resizingActionButtons: boolean;
}

export const ui: UiState = $state({
  resizingActionButtons: false,
});

export const SETTINGS_BUTTON_ID = 'settingsButton';

export const colorPicker = createModal();
export const coloringBook = createModal();
export const settingsModal = createModal();
export const aiPrompt = createModal();

export function buttonCenter(el: HTMLElement): Origin {
  const rect = el.getBoundingClientRect();
  return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
}

export function setResizingActionButtons(active: boolean) {
  ui.resizingActionButtons = active;
}

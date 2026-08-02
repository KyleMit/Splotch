import type { AiErrorKind } from './aiGeneration.svelte';
import { createModal } from './modal.svelte';
import type { Origin } from './modal.svelte';

export interface UiState {
  // True while the parent is dragging the button-size slider. Settings
  // hides everything but the slider so the live-resizing action buttons show.
  resizingActionButtons: boolean;
  clearTutorialVisible: boolean;
  aiGenerating: boolean;
  aiResultOpen: boolean;
  aiResultUrl: string | null;
  aiResultType: string | null;
  aiPreviewUrl: string | null;
  aiError: boolean;
  aiErrorMessage: string | null;
  // 'safety'  — Gemini refused the drawing; guide the child to draw something else.
  // 'retry'   — a transient failure (timeout, server); the same drawing may work.
  // 'generic' — anything else.
  aiErrorKind: AiErrorKind;
}

export const ui: UiState = $state({
  resizingActionButtons: false,
  clearTutorialVisible: false,
  aiGenerating: false,
  aiResultOpen: false,
  aiResultUrl: null,
  aiResultType: null,
  aiPreviewUrl: null,
  aiError: false,
  aiErrorMessage: null,
  aiErrorKind: 'generic',
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

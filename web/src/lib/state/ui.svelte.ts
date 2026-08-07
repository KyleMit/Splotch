import { createModal } from './modal.svelte';

export interface UiState {
  // True while the parent is dragging the button-size slider. Settings
  // hides everything but the slider so the live-resizing action buttons show.
  resizingActionButtons: boolean;
}

export const ui: UiState = $state({
  resizingActionButtons: false,
});

export const SETTINGS_BUTTON_ID = 'settingsButton';

// Deliberately here rather than beside the screenshot feedback that uses it.
// ActionsPanel needs this id at startup; playScreenshotFeedback and the polaroid
// animation are save-pipeline code that must stay off the startup critical path
// (issue #461). Sharing one module for both hands Rollup an edge from the startup
// graph into the save pipeline, and a chunk re-partition then drags the whole
// module onto the preload list — which is what web/tests/startup-bundle.spec.ts
// caught. This module is already on the startup path, so the id costs nothing here.
export const SCREENSHOT_BUTTON_ID = 'screenshotButton';

export const colorPickerModal = createModal();
export const coloringBookModal = createModal();
export const settingsModal = createModal();
export const aiPromptModal = createModal();

export function setResizingActionButtons(active: boolean) {
  ui.resizingActionButtons = active;
}

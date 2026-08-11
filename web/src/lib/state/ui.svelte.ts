import { createModal } from './modal.svelte';

// The Settings sections another surface can deep-link into. Deliberately a
// literal union rather than the `SectionId` it must agree with: this module is on
// the startup path and settings/sections.ts pulls the coloring-pack and
// free-generation stores in behind it. SettingsModal assigns this straight into
// its `SectionId`-typed view, so the compiler holds the agreement there.
export type RequestedSettingsSection = 'ai' | 'parentCenter';

export interface UiState {
  // True while the parent is dragging the button-size slider. Settings
  // hides everything but the slider so the live-resizing action buttons show.
  resizingActionButtons: boolean;
  requestedSettingsSection: RequestedSettingsSection | null;
}

export const ui: UiState = $state({
  resizingActionButtons: false,
  requestedSettingsSection: null,
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

export function openAiSettings(origin: import('./modal.svelte').Origin | null): void {
  ui.requestedSettingsSection = 'ai';
  settingsModal.show(origin);
}

// Land on Parent Center itself, not on the Settings hub in front of it: the one
// caller is a solved Grown-Ups Only challenge, and the parent who solved it asked
// for the policy editor. Reaching it therefore counts as already gated — the wide
// shell reads that from the landing section rather than asking again.
export function openParentCenterSettings(origin: import('./modal.svelte').Origin | null): void {
  ui.requestedSettingsSection = 'parentCenter';
  settingsModal.show(origin);
}

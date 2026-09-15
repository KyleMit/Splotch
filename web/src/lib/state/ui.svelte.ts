import { createModal, type Origin } from './modal.svelte';

// The Settings sections another surface can deep-link into. Deliberately a
// literal union rather than the `SectionId` it must agree with: this module is on
// the startup path and settings/sections.ts pulls the coloring-pack and
// free-generation stores in behind it. SettingsModal assigns this straight into
// its `SectionId`-typed view, so the compiler holds the agreement there.
type RequestedSettingsSection = 'ai' | 'parentCenter';

export interface UiState {
  // True while the parent is dragging the button-size slider. Settings
  // hides everything but the slider so the live-resizing action buttons show.
  readonly resizingActionButtons: boolean;
  readonly requestedSettingsSection: RequestedSettingsSection | null;
  setResizingActionButtons(active: boolean): void;
  requestSettingsSection(section: RequestedSettingsSection): void;
  // SettingsModal consumes a request once it has landed on the section.
  clearRequestedSettingsSection(): void;
}

export function createUi(): UiState {
  const s = $state<{
    resizingActionButtons: boolean;
    requestedSettingsSection: RequestedSettingsSection | null;
  }>({
    resizingActionButtons: false,
    requestedSettingsSection: null,
  });

  return {
    get resizingActionButtons() {
      return s.resizingActionButtons;
    },
    get requestedSettingsSection() {
      return s.requestedSettingsSection;
    },
    setResizingActionButtons(active) {
      s.resizingActionButtons = active;
    },
    requestSettingsSection(section) {
      s.requestedSettingsSection = section;
    },
    clearRequestedSettingsSection() {
      s.requestedSettingsSection = null;
    },
  };
}

export const uiState = createUi();

export const { setResizingActionButtons, clearRequestedSettingsSection } = uiState;

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

export function openAiSettings(origin: Origin | null): void {
  uiState.requestSettingsSection('ai');
  settingsModal.show(origin);
}

// Land on Parent Center itself, not on the Settings hub in front of it: the one
// caller is a solved Grown-Ups Only challenge, and the parent who solved it asked
// for the policy editor. Reaching it therefore counts as already gated — the wide
// shell reads that from the landing section rather than asking again.
export function openParentCenterSettings(origin: Origin | null): void {
  uiState.requestSettingsSection('parentCenter');
  settingsModal.show(origin);
}

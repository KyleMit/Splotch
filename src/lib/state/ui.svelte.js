export const ui = $state({
  colorPickerOpen: false,
  coloringBookOpen: false,
  parentCenterOpen: false,
  clearTutorialVisible: false,
  aiPromptOpen: false,
  aiGenerating: false,
  aiResultOpen: false,
  aiResultUrl: null,
  aiPreviewUrl: null,
  aiError: false
});

export function openColorPicker(origin) {
  ui.colorPickerOrigin = origin;
  ui.colorPickerOpen = true;
}

export function closeColorPicker() {
  ui.colorPickerOpen = false;
}

export function openColoringBook(origin) {
  ui.coloringBookOrigin = origin;
  ui.coloringBookOpen = true;
}

export function closeColoringBook() {
  ui.coloringBookOpen = false;
}

export function openParentCenter(origin) {
  ui.parentCenterOrigin = origin;
  ui.parentCenterOpen = true;
}

export function closeParentCenter() {
  ui.parentCenterOpen = false;
}

export function openAiPrompt(origin) {
  ui.aiPromptOrigin = origin;
  ui.aiPromptOpen = true;
}

export function closeAiPrompt() {
  ui.aiPromptOpen = false;
}

// Open the result modal in its loading state. `previewUrl` is an object URL of
// the child's own drawing — shown blurred behind the progress dial while the
// AI image is being generated.
export function startAiGeneration(previewUrl) {
  if (ui.aiPreviewUrl && ui.aiPreviewUrl !== previewUrl) URL.revokeObjectURL(ui.aiPreviewUrl);
  if (ui.aiResultUrl) {
    URL.revokeObjectURL(ui.aiResultUrl);
    ui.aiResultUrl = null;
  }
  ui.aiPreviewUrl = previewUrl ?? null;
  ui.aiError = false;
  ui.aiGenerating = true;
  ui.aiResultOpen = true;
}

// Slot the blurred drawing in behind the dial once it's ready. Used when the
// modal was opened ahead of the canvas export (so the spinner launches on tap),
// then the preview arrives a beat later.
export function setAiPreview(previewUrl) {
  // The user may have dismissed the loading modal before the export finished —
  // if so, drop the preview rather than leaking the object URL.
  if (!ui.aiResultOpen) {
    URL.revokeObjectURL(previewUrl);
    return;
  }
  if (ui.aiPreviewUrl && ui.aiPreviewUrl !== previewUrl) URL.revokeObjectURL(ui.aiPreviewUrl);
  ui.aiPreviewUrl = previewUrl ?? null;
}

// The finished image has arrived — hand it to the modal so the dial can race to
// completion and reveal it.
export function finishAiGeneration(url) {
  // The user may have dismissed the modal while we were waiting — if so, drop
  // the result rather than reopening it.
  if (!ui.aiResultOpen) {
    URL.revokeObjectURL(url);
    return;
  }
  if (ui.aiResultUrl && ui.aiResultUrl !== url) URL.revokeObjectURL(ui.aiResultUrl);
  ui.aiResultUrl = url;
  ui.aiGenerating = false;
}

export function failAiGeneration() {
  if (!ui.aiResultOpen) return;
  ui.aiGenerating = false;
  ui.aiError = true;
}

export function closeAiResult() {
  ui.aiResultOpen = false;
  ui.aiGenerating = false;
  ui.aiError = false;
  if (ui.aiResultUrl) {
    URL.revokeObjectURL(ui.aiResultUrl);
    ui.aiResultUrl = null;
  }
  if (ui.aiPreviewUrl) {
    URL.revokeObjectURL(ui.aiPreviewUrl);
    ui.aiPreviewUrl = null;
  }
}

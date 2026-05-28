export const ui = $state({
  colorPickerOpen: false,
  coloringBookOpen: false,
  parentCenterOpen: false,
  clearTutorialVisible: false,
  aiGenerating: false,
  aiResultOpen: false,
  aiResultUrl: null
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

export function openAiResult(url) {
  if (ui.aiResultUrl && ui.aiResultUrl !== url) URL.revokeObjectURL(ui.aiResultUrl);
  ui.aiResultUrl = url;
  ui.aiResultOpen = true;
}

export function closeAiResult() {
  ui.aiResultOpen = false;
  if (ui.aiResultUrl) {
    URL.revokeObjectURL(ui.aiResultUrl);
    ui.aiResultUrl = null;
  }
}

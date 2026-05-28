export const ui = $state({
  colorPickerOpen: false,
  coloringBookOpen: false,
  parentCenterOpen: false,
  clearTutorialVisible: false
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

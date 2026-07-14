// Screen-space point a modal animates out from (the tapped button's center).
export interface Origin {
  x: number;
  y: number;
}

interface UiState {
  colorPickerOpen: boolean;
  colorPickerOrigin: Origin | null;
  coloringBookOpen: boolean;
  coloringBookOrigin: Origin | null;
  parentCenterOpen: boolean;
  parentCenterOrigin: Origin | null;
  // True while the parent is dragging the button-size slider. The Parent Center
  // hides everything but the slider so the live-resizing action buttons show.
  resizingActionButtons: boolean;
  clearTutorialVisible: boolean;
  aiPromptOpen: boolean;
  aiPromptOrigin: Origin | null;
  aiGenerating: boolean;
  aiResultOpen: boolean;
  aiResultUrl: string | null;
  aiPreviewUrl: string | null;
  aiError: boolean;
  aiErrorMessage: string | null;
  // 'safety'  — Gemini refused the drawing; guide the child to draw something else.
  // 'retry'   — a transient failure (timeout, server); the same drawing may work.
  // 'generic' — anything else.
  aiErrorKind: AiErrorKind;
}

export type AiErrorKind = 'generic' | 'safety' | 'retry';

interface ActiveAiGeneration {
  id: number;
  controller: AbortController;
}

let nextAiGenerationId = 0;
let activeAiGeneration: ActiveAiGeneration | null = null;

export const ui: UiState = $state({
  colorPickerOpen: false,
  colorPickerOrigin: null,
  coloringBookOpen: false,
  coloringBookOrigin: null,
  parentCenterOpen: false,
  parentCenterOrigin: null,
  resizingActionButtons: false,
  clearTutorialVisible: false,
  aiPromptOpen: false,
  aiPromptOrigin: null,
  aiGenerating: false,
  aiResultOpen: false,
  aiResultUrl: null,
  aiPreviewUrl: null,
  aiError: false,
  aiErrorMessage: null,
  aiErrorKind: 'generic',
});

export function buttonCenter(el: HTMLElement): Origin {
  const rect = el.getBoundingClientRect();
  return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
}

export function openColorPicker(origin: Origin | null) {
  ui.colorPickerOrigin = origin;
  ui.colorPickerOpen = true;
}

export function closeColorPicker() {
  ui.colorPickerOpen = false;
}

export function openColoringBook(origin: Origin | null) {
  ui.coloringBookOrigin = origin;
  ui.coloringBookOpen = true;
}

export function closeColoringBook() {
  ui.coloringBookOpen = false;
}

export function openParentCenter(origin: Origin | null) {
  ui.parentCenterOrigin = origin;
  ui.parentCenterOpen = true;
}

export function closeParentCenter() {
  ui.parentCenterOpen = false;
}

export function setResizingActionButtons(active: boolean) {
  ui.resizingActionButtons = active;
}

export function openAiPrompt(origin: Origin | null) {
  ui.aiPromptOrigin = origin;
  ui.aiPromptOpen = true;
}

export function closeAiPrompt() {
  ui.aiPromptOpen = false;
}

// Revoke the outgoing object URL (when there is one and it's actually being
// replaced) and return the incoming one, so a single assignment swaps the value
// without leaking the old blob. Call with `next` omitted to revoke and clear.
function swapObjectUrl(prev: string | null, next: string | null = null): string | null {
  if (prev && prev !== next) URL.revokeObjectURL(prev);
  return next ?? null;
}

// Open the result modal in its loading state. `previewUrl` is an object URL of
// the child's own drawing — shown blurred behind the progress dial while the
// AI image is being generated.
export function startAiGeneration(
  previewUrl: string | null,
  controller = new AbortController()
): number {
  activeAiGeneration?.controller.abort();
  const id = ++nextAiGenerationId;
  activeAiGeneration = { id, controller };
  ui.aiPreviewUrl = swapObjectUrl(ui.aiPreviewUrl, previewUrl);
  ui.aiResultUrl = swapObjectUrl(ui.aiResultUrl);
  ui.aiError = false;
  ui.aiErrorMessage = null;
  ui.aiErrorKind = 'generic';
  ui.aiGenerating = true;
  ui.aiResultOpen = true;
  return id;
}

export function isAiGenerationActive(id: number): boolean {
  return activeAiGeneration?.id === id;
}

export function endAiGeneration(id: number) {
  if (isAiGenerationActive(id)) activeAiGeneration = null;
}

// Slot the blurred drawing in behind the dial once it's ready. Used when the
// modal was opened ahead of the canvas export (so the spinner launches on tap),
// then the preview arrives a beat later.
export function setAiPreview(id: number, previewUrl: string) {
  if (!isAiGenerationActive(id) || !ui.aiResultOpen) {
    URL.revokeObjectURL(previewUrl);
    return;
  }
  ui.aiPreviewUrl = swapObjectUrl(ui.aiPreviewUrl, previewUrl);
}

// The finished image has arrived — hand it to the modal so the dial can race to
// completion and reveal it.
export function finishAiGeneration(id: number, url: string): boolean {
  if (!isAiGenerationActive(id) || !ui.aiResultOpen) {
    URL.revokeObjectURL(url);
    return false;
  }
  ui.aiResultUrl = swapObjectUrl(ui.aiResultUrl, url);
  ui.aiGenerating = false;
  return true;
}

export function failAiGeneration(id: number, message?: string, kind: AiErrorKind = 'generic') {
  if (!isAiGenerationActive(id) || !ui.aiResultOpen) return;
  ui.aiGenerating = false;
  ui.aiError = true;
  ui.aiErrorMessage = message ?? null;
  ui.aiErrorKind = kind;
}

export function closeAiResult() {
  activeAiGeneration?.controller.abort();
  activeAiGeneration = null;
  ui.aiResultOpen = false;
  ui.aiGenerating = false;
  ui.aiError = false;
  ui.aiErrorMessage = null;
  ui.aiErrorKind = 'generic';
  ui.aiResultUrl = swapObjectUrl(ui.aiResultUrl);
  ui.aiPreviewUrl = swapObjectUrl(ui.aiPreviewUrl);
}

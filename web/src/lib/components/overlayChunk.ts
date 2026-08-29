// The overlays that are always invisible at boot (state-driven dialogs and the
// earned install banner), grouped into one lazy chunk. The
// mountBootHiddenOverlays() pump in lib/boot/bootHiddenOverlays.ts imports this
// module off the first-load long task. A requested overlay loads and mounts
// ahead of the background queue; otherwise their subtrees become resident one
// per interaction-quiet idle slice, with SettingsModal last.
// Late mount is safe: each dialog's modalDialog $effect reads its ui.*Open
// flag on first run, so a tap that opened one before the chunk arrived still
// shows it the moment it mounts.
export { default as ParentalGate } from './ParentalGate.svelte';
export { default as ColorPicker } from './ColorPicker.svelte';
export { default as ColoringBook } from './ColoringBook.svelte';
export { default as SettingsModal } from './SettingsModal.svelte';
export { default as AiImagePrompt } from './AiImagePrompt.svelte';
export { default as AiImageResult } from './AiImageResult.svelte';
export { default as AiWaitingPolaroid } from './AiWaitingPolaroid.svelte';
export { default as InstallBanner } from './InstallBanner.svelte';

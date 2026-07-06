// The overlays that are always invisible at boot (state-driven dialogs and the
// earned install banner), grouped into one lazy chunk. +page.svelte imports
// this module at idle so their code never loads — and their subtrees never
// hydrate — inside the first-load long task; most then mount one per idle
// callback, while the heavyweight ParentCenter waits for its first open.
// Late mount is safe: each dialog's modalDialog $effect reads its ui.*Open
// flag on first run, so a tap that opened one before the chunk arrived still
// shows it the moment it mounts.
export { default as ColorPicker } from './ColorPicker.svelte';
export { default as ColoringBook } from './ColoringBook.svelte';
export { default as ParentCenter } from './ParentCenter.svelte';
export { default as AiImagePrompt } from './AiImagePrompt.svelte';
export { default as AiImageResult } from './AiImageResult.svelte';
export { default as InstallBanner } from './InstallBanner.svelte';

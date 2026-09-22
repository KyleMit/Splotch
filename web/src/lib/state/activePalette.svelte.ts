import {
  COLOR_BLIND_PALETTE,
  COLOR_BLIND_TRIM_ORDER,
  PALETTE_COLORS,
  TRIM_ORDER,
  type PaletteColor,
} from '$lib/palette';
import { settingsState } from './settings.svelte';

// The crayon set the drawing surface shows: the brand palette, or the
// color-blind friendly set when the parent switched it on. paletteHex() and
// its static callers (beta, privacy, the parental gate) keep the brand palette.
export function activePalette(): readonly PaletteColor[] {
  return settingsState.colorBlindFriendlyEnabled ? COLOR_BLIND_PALETTE : PALETTE_COLORS;
}

export function activeTrimOrder(): readonly string[] {
  return settingsState.colorBlindFriendlyEnabled ? COLOR_BLIND_TRIM_ORDER : TRIM_ORDER;
}

// Shared geometry for the Actions Panel button row, used by two consumers that
// must agree: ActionsPanel caps the rendered button size so the expanded row
// can never overlap the Parent Help Button (landscape) or run off the top of
// the screen (portrait), and the Parent Center's Button Size slider caps its
// range so a parent can't even pick a size the current screen can't fit.
import {
  settings,
  ACTION_BUTTON_SCALE_MIN,
  ACTION_BUTTON_SCALE_MAX,
} from '$lib/state/settings.svelte';
import { network } from '$lib/state/network.svelte';
import { layout } from '$lib/state/layout.svelte';

// Keep in sync with the .actions-drawer-inner gap in ActionsPanel.svelte.
export const ACTION_BUTTON_GAP = 12;

// Unscaled button size (matches the Color Swatch touch target per orientation).
export const ACTION_BUTTON_BASE_LANDSCAPE = 60;
export const ACTION_BUTTON_BASE_PORTRAIT = 55;

// Space the landscape row must leave at the right edge for the Parent Help
// Button: its 8px inset + 48px button + 8px breathing room.
export const PARENT_BUTTON_RESERVE = 64;

// The panel's other fixed costs: its 8px screen inset, the drawer→toggle
// collapse margin (8px), and the 48px drawer toggle.
export const PANEL_INSET = 8;
export const DRAWER_TOGGLE_MARGIN = 8;
export const DRAWER_TOGGLE_SIZE = 48;

// Breathing room between the top of the portrait column and the palette bar.
export const PALETTE_CLEARANCE = 8;

// Every button the panel can show: stroke width, eraser, crayon, coloring book,
// magic brush, screenshot, AI image, undo. The prerendered page sizes for this worst
// case — the server can't know a stored AI token or toggle states.
export const MAX_ACTION_BUTTON_COUNT = 8;

export function visibleActionButtonCount(): number {
  return (
    2 + // crayon and magic brush, always shown
    (settings.strokeWidthControlEnabled ? 1 : 0) +
    (settings.eraserEnabled ? 1 : 0) +
    (settings.coloringBookEnabled ? 1 : 0) +
    (settings.screenshotEnabled ? 1 : 0) +
    (settings.aiAccessToken && settings.aiImageEnabled && network.online ? 1 : 0) +
    (settings.undoButtonEnabled ? 1 : 0)
  );
}

// The space one button may occupy on the current screen, in px, before the row
// (landscape: up to the Parent Help Button reserve) or the column (portrait:
// up to the palette bar) runs out. Mirrors the CSS cap in ActionsPanel — keep
// the two formulas in step.
function availablePerButton(buttonCount: number): number {
  const { orientation, safeArea } = layout;
  const chrome =
    PANEL_INSET + DRAWER_TOGGLE_MARGIN + DRAWER_TOGGLE_SIZE + (buttonCount - 1) * ACTION_BUTTON_GAP;
  const budget =
    orientation === 'portrait'
      ? layout.viewportHeight -
        layout.paletteHeight -
        PALETTE_CLEARANCE -
        safeArea.top -
        safeArea.bottom -
        chrome
      : layout.viewportWidth -
        layout.paletteWidth -
        PARENT_BUTTON_RESERVE -
        safeArea.left -
        safeArea.right -
        chrome;
  return budget / buttonCount;
}

// Largest Button Size percentage the current screen can show without the
// render-time cap kicking in — the Parent Center slider's dynamic max, so the
// parent can't pick a size that would flow off the screen. Clamped to the
// slider's static range: on an absurdly small viewport the render cap (below)
// still bounds the actual size.
export function maxActionButtonScale(): number {
  const base =
    layout.orientation === 'portrait' ? ACTION_BUTTON_BASE_PORTRAIT : ACTION_BUTTON_BASE_LANDSCAPE;
  const pct = Math.floor((availablePerButton(visibleActionButtonCount()) / base) * 100);
  return Math.min(ACTION_BUTTON_SCALE_MAX, Math.max(ACTION_BUTTON_SCALE_MIN, pct));
}

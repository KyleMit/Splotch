// Shared geometry for the Actions Panel button row, used by two consumers that
// must agree: ActionsPanel caps the rendered button size so the expanded row
// can never overlap the Settings Button (landscape) or run off the top of
// the screen (portrait), and the Button Size slider in Settings caps its
// range so a parent can't even pick a size the current screen can't fit.
import {
  aiCredentialKind,
  settings,
  ACTION_BUTTON_SCALE_MIN,
  ACTION_BUTTON_SCALE_MAX,
} from '$lib/state/settings.svelte';
import { network } from '$lib/state/network.svelte';
import { layout } from '$lib/state/layout.svelte';
import { toolState } from '$lib/state/tool.svelte';
import {
  landscapeSingleColumnMediaQuery,
  PALETTE_LANDSCAPE_WIDTHS_PX,
} from '$lib/design/trimGeometry';

// Keep in sync with the .actions-drawer-inner gap in ActionsPanel.svelte.
export const ACTION_BUTTON_GAP = 12;

// Unscaled button size (matches the Color Swatch touch target per orientation).
export const ACTION_BUTTON_BASE_LANDSCAPE = 60;
export const ACTION_BUTTON_BASE_PORTRAIT = 55;

// Space the landscape row must leave at the right edge for the Settings
// Button: its 8px inset + 48px button + 8px breathing room.
export const SETTINGS_BUTTON_RESERVE = 64;

// The panel's other fixed costs: its 8px screen inset, the drawer→toggle
// collapse margin (8px), and the 48px drawer toggle.
export const PANEL_INSET = 8;
const DRAWER_TOGGLE_MARGIN = 8;
const DRAWER_TOGGLE_SIZE = 48;
export const PANEL_FIXED_CHROME = PANEL_INSET + DRAWER_TOGGLE_MARGIN + DRAWER_TOGGLE_SIZE;

// Breathing room between the top of the portrait column and the palette bar.
export const PALETTE_CLEARANCE = 8;

// Every button the hydrated panel can show: brush menu, stroke width, coloring
// book, screenshot, AI image, undo.
export const MAX_ACTION_BUTTON_COUNT = 6;

// The AI button is always hidden in the prerendered HTML because its visibility
// depends on client-only credential and network state.
export const PRERENDERED_ACTION_BUTTON_COUNT = MAX_ACTION_BUTTON_COUNT - 1;

export const PRERENDERED_ACTION_BUTTON_CHROME =
  (PRERENDERED_ACTION_BUTTON_COUNT - 1) * ACTION_BUTTON_GAP + PANEL_FIXED_CHROME;

// Conservative portrait fallback chrome: all MAX_ACTION_BUTTON_COUNT buttons
// (so MAX-1 gaps) plus the panel's screen inset, drawer→toggle collapse margin,
// and drawer toggle. The CSS --action-btn-fallback bakes the resolved portrait
// total as a literal because it owns first paint before any TS loads (ADR-0040);
// actionButtonLayout.fallback.test.ts guards it against these constants.
export const WORST_CASE_CHROME =
  (MAX_ACTION_BUTTON_COUNT - 1) * ACTION_BUTTON_GAP + PANEL_FIXED_CHROME;

// Stable portrait palette-bar height the CSS portrait fallback reserves so the
// column clears the palette on short screens (the hydrated formula subtracts
// the measured palette height instead).
export const PALETTE_BAR_RESERVE = 76;

export function isAiImageButtonVisible(): boolean {
  return aiCredentialKind() !== 'none' && settings.aiImageEnabled && network.online;
}

export function visibleActionButtonCount(): number {
  return (
    1 + // brush menu, always shown (the eraser toggle hides a menu entry, not a button)
    (settings.strokeWidthControlEnabled ? 1 : 0) +
    (settings.coloringBookEnabled ? 1 : 0) +
    (settings.screenshotEnabled ? 1 : 0) +
    (isAiImageButtonVisible() ? 1 : 0) +
    (settings.undoButtonEnabled ? 1 : 0)
  );
}

// ColorPalette publishes its measured width after hydration. Until then its
// responsive CSS geometry is deterministic, so layout consumers use the same
// two values app.css exposes through --palette-landscape-width instead of
// briefly treating the palette as zero-width.
export function resolvedLandscapePaletteWidth(): number {
  const measurement = layout.paletteMeasurement;
  if (
    layout.orientation === 'landscape' &&
    measurement.orientation === 'landscape' &&
    measurement.width > 0
  ) {
    return measurement.width;
  }
  return typeof matchMedia !== 'undefined' && matchMedia(landscapeSingleColumnMediaQuery()).matches
    ? PALETTE_LANDSCAPE_WIDTHS_PX.singleColumn
    : PALETTE_LANDSCAPE_WIDTHS_PX.twoColumns;
}

// The space one button may occupy on the current screen, in px, before the row
// (landscape: up to the reserve for the Settings Button) or the column (portrait:
// up to the palette bar) runs out. Mirrors the CSS cap in ActionsPanel — keep
// the two formulas in step.
function availablePerButton(buttonCount: number): number {
  const { orientation, safeArea } = layout;
  const chrome = PANEL_FIXED_CHROME + (buttonCount - 1) * ACTION_BUTTON_GAP;
  const budget =
    orientation === 'portrait'
      ? layout.viewportHeight -
        layout.paletteMeasurement.height -
        PALETTE_CLEARANCE -
        safeArea.top -
        safeArea.bottom -
        chrome
      : layout.viewportWidth -
        resolvedLandscapePaletteWidth() -
        SETTINGS_BUTTON_RESERVE -
        safeArea.left -
        safeArea.right -
        chrome;
  return budget / buttonCount;
}

// Largest Button Size percentage the current screen can show without the
// render-time cap kicking in — the dynamic maximum of the Button Size slider in Settings, so the
// parent can't pick a size that would flow off the screen. Clamped to the
// slider's static range: on an absurdly small viewport the render cap (below)
// still bounds the actual size.
export function maxActionButtonScale(): number {
  const base =
    layout.orientation === 'portrait' ? ACTION_BUTTON_BASE_PORTRAIT : ACTION_BUTTON_BASE_LANDSCAPE;
  const pct = Math.floor((availablePerButton(visibleActionButtonCount()) / base) * 100);
  return Math.min(ACTION_BUTTON_SCALE_MAX, Math.max(ACTION_BUTTON_SCALE_MIN, pct));
}

// Marks the point where Actions Panel CSS stops reading app.html's immutable
// first-paint seed from <html> and reads live state from the panel subtree.
export const ACTION_PANEL_LIVE_ATTRIBUTE = 'data-action-panel-live';

// Publish the Actions Panel's hydrated UI state onto its own root so CSS can
// drive each control's visibility, the drawer's open state, and the Brush
// Button's face without invalidating the full document. The home page is
// prerendered (ADR-0040), so app.html stamps the same state onto <html> before
// first paint. CSS reads that immutable bootstrap seed until this function
// applies ACTION_PANEL_LIVE_ATTRIBUTE as its final write, then switches to the
// panel-local attributes. The keys/defaults mirror BOOL_SETTINGS in
// settings.svelte.ts and stay centralised here as a unit-testable contract.
//
// Polarity: an attribute marks a DEVIATION from the default, so the raw
// prerendered HTML (no attributes) already shows the defaults — drawer closed,
// advanced controls + every control on, pen brush. `data-drawer-open` is
// present when open; `data-off-*` is present when that control is switched off.
// --action-btn-scale rides here too (a CSS var, default via the var()
// fallback, so it's only meaningful when scaled). The reactive reads below run
// synchronously inside the caller's $effect, so Svelte tracks them as effect
// dependencies exactly as an inline body would.
export function publishActionPanelState(
  el: HTMLElement,
  drawerExpanded: boolean,
  buttonScale: number
): void {
  el.style.setProperty('--action-btn-scale', String(buttonScale));
  el.toggleAttribute('data-drawer-open', drawerExpanded);
  el.toggleAttribute('data-off-adv', !settings.advancedControlsEnabled);
  el.toggleAttribute('data-off-stroke', !settings.strokeWidthControlEnabled);
  el.toggleAttribute('data-off-eraser', !settings.eraserEnabled);
  el.toggleAttribute('data-off-coloring', !settings.coloringBookEnabled);
  el.toggleAttribute('data-off-screenshot', !settings.screenshotEnabled);
  el.toggleAttribute('data-off-undo', !settings.undoButtonEnabled);
  // The Brush Button's face is the active brush's icon. All four icons are in
  // the DOM and CSS shows the one matching this attribute ({@html} icons can't
  // swap during hydration — see .claude/rules/svelte.md), absent for the
  // default pen so the raw prerendered HTML is already correct.
  if (toolState.brush === 'pen') el.removeAttribute('data-brush');
  else el.setAttribute('data-brush', toolState.brush);
  el.setAttribute(ACTION_PANEL_LIVE_ATTRIBUTE, '');
}

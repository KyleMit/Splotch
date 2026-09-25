// Shared geometry for the Actions Panel button row, used by two consumers that
// must agree: app.css caps the rendered button size (the --action-btn-size
// formula on .actions-panel) so the expanded row can never overlap the Settings
// Button (landscape) or run off the top of the screen (portrait), and the
// Button Size slider in Settings caps its range so a parent can't even pick a
// size the current screen can't fit. The CSS bakes these constants as literals
// because it owns first paint (ADR-0040); actionButtonLayout.fallback.test.ts
// holds the literals to the constants and actionButtonLayout.cssFormula.test.ts
// evaluates the formula against availablePerButton.
import {
  settingsState,
  ACTION_BUTTON_SCALE_MIN,
  ACTION_BUTTON_SCALE_MAX,
  actionControlShown,
  enabledOptionalBrushes,
  type ActionPanelControl,
} from '$lib/state/settings.svelte';
import { networkState } from '$lib/state/network.svelte';
import { freeGenerationsState } from '$lib/state/freeGenerations.svelte';
import type { Orientation } from '$lib/platform';
import { layoutState } from '$lib/state/layout.svelte';
import { toolState } from '$lib/state/tool.svelte';
import { PALETTE_LANDSCAPE_WIDTH_PX } from '$lib/design/trimGeometry';
import {
  actionButtonSizeClass,
  LARGE_TABLET_MIN_SIDE_PX,
  TABLET_MIN_SIDE_PX,
  type ActionButtonSizeClass,
} from '$lib/breakpoints';

export const ACTION_BUTTON_GAP = 12;

// The unscaled button size steps with how much screen the child is drawing on.
// A phone has to spend its scarce canvas edge carefully; beside a 13-inch
// tablet's canvas the same button reads as a small target. The Button Size
// slider multiplies whichever step applies (ACTION_BUTTON_SCALE_*), so every
// screen still starts at the slider's centre with its whole range either way —
// the step decides what that centre is worth in pixels.
// Re-exported so this module stays the one place layout code reaches for the
// step; the classifier itself lives beside the boundaries it reads.
export { actionButtonSizeClass, type ActionButtonSizeClass };

// The tablet step is also the Color Swatch touch target per orientation.
export const ACTION_BUTTON_BASE_PX = {
  phone: { landscape: 54, portrait: 50 },
  tablet: { landscape: 60, portrait: 55 },
  largeTablet: { landscape: 68, portrait: 62 },
} as const satisfies Record<ActionButtonSizeClass, Record<Orientation, number>>;

// The CSS custom property carrying the step above. app.css owns its value —
// it has to be right at first paint, before any of this loads (ADR-0040) — so
// the render-time cap below reads the property rather than resolving a number.
export const ACTION_BUTTON_BASE_PROPERTY = '--action-btn-base';

// The floor under a Brush Menu / Stroke Width Menu option, whatever step the
// action button beside it takes. The panel goes smaller than this on a phone to
// hand the canvas back; a popover that closes on the next tap hands nothing
// back, so the same step there would cost touch target and buy no room. Above
// the floor an option squares with the button that opened it. app.css owns the
// rendered size (see .flyout-option); actionButtonLayout.fallback.test.ts holds
// the two together, and actionButtonLayout.touchTargets.test.ts pins what a parent's smallest
// Button Size leaves of it.
export const FLYOUT_OPTION_MIN_BASE_PX = 60;

// A `max-*` bound sits just below the threshold it excludes, so a fractional
// viewport side between the two doesn't fall through both queries.
const BREAKPOINT_EPSILON_PX = 0.02;

// The media queries app.css switches ACTION_BUTTON_BASE_PROPERTY on; the
// tablet step is the unqualified default neither one claims.
// actionButtonLayout.fallback.test.ts holds the committed CSS to these.
export const ACTION_BUTTON_SIZE_CLASS_MEDIA_QUERIES = {
  phone: `(max-width: ${TABLET_MIN_SIDE_PX - BREAKPOINT_EPSILON_PX}px), (max-height: ${
    TABLET_MIN_SIDE_PX - BREAKPOINT_EPSILON_PX
  }px)`,
  largeTablet: `(min-width: ${LARGE_TABLET_MIN_SIDE_PX}px) and (min-height: ${LARGE_TABLET_MIN_SIDE_PX}px)`,
} as const satisfies Partial<Record<ActionButtonSizeClass, string>>;

// The step the slider ceiling measures against. It reads the visible viewport
// while the CSS above reads the layout one, which can disagree by the height of
// a mobile URL bar; that only ever shifts the ceiling, never the rendered size.
export function actionButtonBase(orientation: Orientation): number {
  const sizeClass = actionButtonSizeClass(
    Math.min(layoutState.viewportWidth, layoutState.viewportHeight)
  );
  return ACTION_BUTTON_BASE_PX[sizeClass][orientation];
}

// Space the landscape row must leave at the right edge for the Settings
// Button: its 8px inset + 48px button + 8px breathing room.
export const SETTINGS_BUTTON_RESERVE = 64;

// The panel's other fixed costs: its 8px screen inset, the drawer→toggle
// collapse margin (8px), and the 48px drawer toggle.
export const PANEL_INSET = 8;
const DRAWER_TOGGLE_MARGIN = 8;
export const DRAWER_TOGGLE_SIZE = 48;
export const PANEL_FIXED_CHROME = PANEL_INSET + DRAWER_TOGGLE_MARGIN + DRAWER_TOGGLE_SIZE;

// Leave the top-left corner control clear even at the largest button scale.
export const PHONE_TOOLBAR_BUTTON_PX = 48;
export const PHONE_TOOLBAR_LEG_SLOTS = 4;
export const PHONE_TOOLBAR_GAP_PX = 10;
export const PHONE_TOOLBAR_VERTICAL_CHROME_PX =
  2 * PANEL_INSET + DRAWER_TOGGLE_SIZE + 3 * PHONE_TOOLBAR_GAP_PX;
export const PHONE_TOOLBAR_HORIZONTAL_CHROME_PX =
  PANEL_INSET + DRAWER_TOGGLE_SIZE + SETTINGS_BUTTON_RESERVE + 4 * PHONE_TOOLBAR_GAP_PX;

// Breathing room between the top of the portrait column and the palette bar.
export const PALETTE_CLEARANCE = 8;

// Every button the hydrated panel can show: brush menu, stroke width, coloring
// book, screenshot, AI image, undo.
export const MAX_ACTION_BUTTON_COUNT = 6;

// The prerendered HTML cannot know live connectivity. The boot script uses the
// last known state to paint the button disabled while its grant is checked.
export const FIRST_PAINT_ACTION_BUTTON_COUNT_DEFAULT = MAX_ACTION_BUTTON_COUNT - 1;

// The custom property carrying the occupied button count the app.css formula
// divides by: seeded on <html> by app.html for first paint, published on the
// panel's own root once hydrated.
export const ACTION_BUTTON_COUNT_PROPERTY = '--action-btn-count';

export const LANDSCAPE_FIXED_RESERVE = SETTINGS_BUTTON_RESERVE + PANEL_FIXED_CHROME;
export const PORTRAIT_FIXED_RESERVE = PALETTE_CLEARANCE + PANEL_FIXED_CHROME;

// The portrait palette bar's declared height: the 55px swatch row inside its
// 10px padding. ColorPalette draws the bar at app.css's --palette-portrait-height
// and the portrait formula there clears it; actionButtonLayout.fallback.test.ts
// holds the token to this.
export const PALETTE_BAR_RESERVE = 75;

export function isAiImageButtonVisible(): boolean {
  const hasCredential = Boolean(settingsState.aiUserApiKey || settingsState.aiAccessToken);
  return (
    settingsState.aiImageEnabled &&
    networkState.online &&
    (hasCredential || freeGenerationsState.available)
  );
}

export function isAiImageButtonShown(): boolean {
  return settingsState.aiImageEnabled && networkState.online;
}

export function visibleActionButtonCount(): number {
  return (
    (enabledOptionalBrushes().length > 0 ? 1 : 0) +
    (actionControlShown('strokeWidthControlEnabled') ? 1 : 0) +
    (actionControlShown('coloringBookEnabled') ? 1 : 0) +
    (actionControlShown('screenshotEnabled') ? 1 : 0) +
    (isAiImageButtonVisible() ? 1 : 0) +
    (actionControlShown('undoButtonEnabled') ? 1 : 0)
  );
}

// Count the button the parent sees, including a disabled one shown from the
// boot hint while the grant is pending.
export function layoutActionButtonCount(): number {
  return visibleActionButtonCount() + (isAiImageButtonShown() && !isAiImageButtonVisible() ? 1 : 0);
}

// The palette's extent along the row's axis: the landscape column's declared
// width (app.css --palette-landscape-width, 0 on a landscape phone where the
// column is hidden) or the portrait bar's declared height.
function paletteExtent(orientation: Orientation): number {
  if (orientation === 'portrait') return PALETTE_BAR_RESERVE;
  return layoutState.phoneLandscape ? 0 : PALETTE_LANDSCAPE_WIDTH_PX;
}

// Everything the panel spends out of the viewport extent before the rest is
// divided between the buttons: the palette bar the row/column must clear, the
// orientation's edge reserve, and the panel's own chrome (screen inset, drawer
// toggle, and the gaps between buttons).
function fixedRowCost(
  orientation: Orientation,
  buttonCount: number,
  paletteExtent: number
): number {
  const edgeReserve = orientation === 'portrait' ? PALETTE_CLEARANCE : SETTINGS_BUTTON_RESERVE;
  return paletteExtent + edgeReserve + PANEL_FIXED_CHROME + (buttonCount - 1) * ACTION_BUTTON_GAP;
}

// The space one button may occupy on the current screen, in px, before the row
// (landscape: up to the reserve for the Settings Button) or the column (portrait:
// up to the palette bar) runs out. The app.css --action-btn-size formula is the
// same budget in CSS; actionButtonLayout.cssFormula.test.ts evaluates it against this.
// Exported only so that test can hold the formula to this number;
// maxActionButtonScale is the production caller.
export function availablePerButton(buttonCount: number): number {
  const { orientation, safeArea } = layoutState;
  const [viewportExtent, insets] =
    orientation === 'portrait'
      ? [layoutState.viewportHeight, safeArea.top + safeArea.bottom]
      : [layoutState.viewportWidth, safeArea.left + safeArea.right];
  return (
    (viewportExtent - fixedRowCost(orientation, buttonCount, paletteExtent(orientation)) - insets) /
    buttonCount
  );
}

export function renderedActionButtonSize(): number {
  const {
    viewportWidth: width,
    viewportHeight: height,
    safeArea: safe,
    phoneLandscape,
    orientation,
  } = layoutState;
  const scale = settingsState.actionButtonScale / 100;
  if (phoneLandscape)
    return Math.min(
      PHONE_TOOLBAR_BUTTON_PX * scale,
      (height - safe.top - safe.bottom - PHONE_TOOLBAR_VERTICAL_CHROME_PX) /
        PHONE_TOOLBAR_LEG_SLOTS,
      (width - safe.left - safe.right - PHONE_TOOLBAR_HORIZONTAL_CHROME_PX) /
        PHONE_TOOLBAR_LEG_SLOTS
    );
  return Math.min(
    actionButtonBase(orientation) * scale,
    availablePerButton(Math.max(1, layoutActionButtonCount()))
  );
}

// A flyout option's rendered size: the size-class step floored at
// FLYOUT_OPTION_MIN_BASE_PX, then scaled — app.css's .flyout-option formula,
// which the bare toolbar's glass has to agree with to cover an open menu. It
// deliberately skips the per-button viewport cap: the menu is an extension of
// the button that opened it and follows the slider, not the row's room.
export function renderedFlyoutOptionSize(): number {
  const scale = settingsState.actionButtonScale / 100;
  return Math.max(actionButtonBase(layoutState.orientation), FLYOUT_OPTION_MIN_BASE_PX) * scale;
}

// Largest Button Size percentage the current screen can show without the
// render-time cap kicking in — the dynamic maximum of the Button Size slider in Settings, so the
// parent can't pick a size that would flow off the screen. Clamped to the
// slider's static range: on an absurdly small viewport the render cap (below)
// still bounds the actual size.
function phoneToolbarAvailablePerButton(): number {
  const { safeArea } = layoutState;
  return Math.min(
    (layoutState.viewportHeight -
      safeArea.top -
      safeArea.bottom -
      PHONE_TOOLBAR_VERTICAL_CHROME_PX) /
      PHONE_TOOLBAR_LEG_SLOTS,
    (layoutState.viewportWidth -
      safeArea.left -
      safeArea.right -
      PHONE_TOOLBAR_HORIZONTAL_CHROME_PX) /
      PHONE_TOOLBAR_LEG_SLOTS
  );
}

export function maxActionButtonScale(): number {
  const base = layoutState.phoneLandscape
    ? PHONE_TOOLBAR_BUTTON_PX
    : actionButtonBase(layoutState.orientation);
  const available = layoutState.phoneLandscape
    ? phoneToolbarAvailablePerButton()
    : availablePerButton(layoutActionButtonCount());
  const pct = Math.floor((available / base) * 100);
  return Math.min(ACTION_BUTTON_SCALE_MAX, Math.max(ACTION_BUTTON_SCALE_MIN, pct));
}

// Marks the point where Actions Panel CSS stops reading app.html's immutable
// first-paint seed from <html> and reads live state from the panel subtree.
export const ACTION_PANEL_LIVE_ATTRIBUTE = 'data-action-panel-live';

// Every Actions Panel control a parent can switch off, mapped to the attribute
// that marks it hidden. An attribute reads the control's effective visibility
// (actionControlShown), so a drawer-owned control is marked off by the Tool
// Drawer switch as well as by its own flag. app.html's inline boot script
// re-types these names as literals because it can't import (see
// publishActionPanelState below); app.html.test.ts diffs its list against this
// table.
export const CONTROL_OFF_ATTRIBUTES = {
  strokeWidthControlEnabled: 'data-off-stroke',
  crayonEnabled: 'data-off-crayon',
  magicBrushEnabled: 'data-off-magic',
  eraserEnabled: 'data-off-eraser',
  coloringBookEnabled: 'data-off-coloring',
  screenshotEnabled: 'data-off-screenshot',
  undoButtonEnabled: 'data-off-undo',
} as const satisfies Record<ActionPanelControl, `data-off-${string}`>;

const controlOffEntries = Object.entries(CONTROL_OFF_ATTRIBUTES) as [ActionPanelControl, string][];

// The rest of the seeded vocabulary app.html's boot script re-types: the
// drawer's open state, and the brush the Brush Button wears.
export const DRAWER_OPEN_ATTRIBUTE = 'data-drawer-open';
export const BRUSH_ATTRIBUTE = 'data-brush';
export const SINGLE_BRUSH_ATTRIBUTE = 'data-single-brush';
export const NO_ACTIONS_ATTRIBUTE = 'data-no-actions';
export const AI_SLOT_ATTRIBUTE = 'data-ai-slot';

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
// every control on, pen brush. `data-drawer-open` is present when open;
// `data-off-*` is present when that control is hidden.
// --action-btn-scale rides here too (a CSS var, default via the var()
// fallback, so it's only meaningful when scaled), as does the live button
// count the size formula divides by. The reactive reads below run
// synchronously inside the caller's $effect, so Svelte tracks them as effect
// dependencies exactly as an inline body would.
export function publishActionPanelState(
  el: HTMLElement,
  drawerExpanded: boolean,
  buttonScale: number
): void {
  el.style.setProperty('--action-btn-scale', String(buttonScale));
  // The live count the app.css size formula divides by; floored at one so an
  // empty panel (hidden by NO_ACTIONS_ATTRIBUTE) never divides by zero.
  el.style.setProperty(
    ACTION_BUTTON_COUNT_PROPERTY,
    String(Math.max(1, layoutActionButtonCount()))
  );
  el.toggleAttribute(DRAWER_OPEN_ATTRIBUTE, drawerExpanded);
  for (const [key, attribute] of controlOffEntries) {
    el.toggleAttribute(attribute, !actionControlShown(key));
  }
  const optionalBrushes = enabledOptionalBrushes();
  if (optionalBrushes.length === 1) {
    el.setAttribute(SINGLE_BRUSH_ATTRIBUTE, optionalBrushes[0]);
  } else {
    el.removeAttribute(SINGLE_BRUSH_ATTRIBUTE);
  }
  el.toggleAttribute(NO_ACTIONS_ATTRIBUTE, layoutActionButtonCount() === 0);
  // The Brush Button's face is the active brush's icon. All four icons are in
  // the DOM and CSS shows the one matching this attribute ({@html} icons can't
  // swap during hydration — see .claude/rules/svelte.md), absent for the
  // default pen so the raw prerendered HTML is already correct.
  if (toolState.brush === 'pen') el.removeAttribute(BRUSH_ATTRIBUTE);
  else el.setAttribute(BRUSH_ATTRIBUTE, toolState.brush);
  el.setAttribute(ACTION_PANEL_LIVE_ATTRIBUTE, '');
}

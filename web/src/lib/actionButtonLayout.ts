// Shared geometry for the Actions Panel button row, used by two consumers that
// must agree: ActionsPanel caps the rendered button size so the expanded row
// can never overlap the Settings Button (landscape) or run off the top of
// the screen (portrait), and the Button Size slider in Settings caps its
// range so a parent can't even pick a size the current screen can't fit.
import {
  settings,
  ACTION_BUTTON_SCALE_MIN,
  ACTION_BUTTON_SCALE_MAX,
  enabledOptionalBrushes,
} from '$lib/state/settings.svelte';
import { network } from '$lib/state/network.svelte';
import { freeGenerations } from '$lib/state/freeGenerations.svelte';
import type { Orientation } from '$lib/platform';
import { safeAreaLength } from '$lib/platform/safeArea';
import { layout } from '$lib/state/layout.svelte';
import { toolState } from '$lib/state/tool.svelte';
import {
  landscapeSingleColumnMediaQuery,
  PALETTE_LANDSCAPE_WIDTHS_PX,
} from '$lib/design/trimGeometry';
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
// the two together, and actionButtonLayout.test.ts pins what a parent's smallest
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
  const sizeClass = actionButtonSizeClass(Math.min(layout.viewportWidth, layout.viewportHeight));
  return ACTION_BUTTON_BASE_PX[sizeClass][orientation];
}

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

// The AI button is hidden in the prerendered HTML because its visibility depends
// on client-only credential, grant-availability, and network state. app.html
// corrects this default count before first paint when persisted settings hide
// other buttons.
export const FIRST_PAINT_ACTION_BUTTON_COUNT_DEFAULT = MAX_ACTION_BUTTON_COUNT - 1;
export const FIRST_PAINT_ACTION_BUTTON_GAP_TOTAL_DEFAULT =
  (FIRST_PAINT_ACTION_BUTTON_COUNT_DEFAULT - 1) * ACTION_BUTTON_GAP;

export const LANDSCAPE_FIXED_RESERVE = SETTINGS_BUTTON_RESERVE + PANEL_FIXED_CHROME;

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
  const hasCredential = Boolean(settings.aiUserApiKey || settings.aiAccessToken);
  return settings.aiImageEnabled && network.online && (hasCredential || freeGenerations.available);
}

export function visibleActionButtonCount(): number {
  return (
    (enabledOptionalBrushes().length > 0 ? 1 : 0) +
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

export function resolvedPortraitPaletteHeight(): number {
  const measurement = layout.paletteMeasurement;
  if (
    layout.orientation === 'portrait' &&
    measurement.orientation === 'portrait' &&
    measurement.height > 0
  ) {
    return measurement.height;
  }
  return PALETTE_BAR_RESERVE;
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
// up to the palette bar) runs out. buttonSizeCssExpr builds the render-time cap
// from the same fixedRowCost, so the two can't drift.
// Exported only so the equivalence test can hold that CSS expression against
// this number; maxActionButtonScale is the production caller.
export function availablePerButton(buttonCount: number): number {
  const { orientation, safeArea } = layout;
  const [viewportExtent, paletteExtent, insets] =
    orientation === 'portrait'
      ? [layout.viewportHeight, resolvedPortraitPaletteHeight(), safeArea.top + safeArea.bottom]
      : [layout.viewportWidth, resolvedLandscapePaletteWidth(), safeArea.left + safeArea.right];
  return (
    (viewportExtent - fixedRowCost(orientation, buttonCount, paletteExtent) - insets) / buttonCount
  );
}

export type ActionButtonSizeInputs =
  | {
      orientation: 'portrait';
      buttonCount: number;
      paletteHeight: number;
      viewportHeight: number;
    }
  | { orientation: 'landscape'; buttonCount: number; paletteWidth: number };

// The hydrated render cap as a CSS length: the scaled base size, capped by the
// same budget availablePerButton computes. Three terms stay symbolic because the
// browser resolves them at paint time — the safe-area insets, where
// availablePerButton subtracts the measured layout.safeArea instead, the
// landscape viewport width, and the size-class base. Portrait takes the measured
// viewportHeight rather than 100vh (see ActionsPanel).
export function buttonSizeCssExpr(inputs: ActionButtonSizeInputs): string {
  const { orientation, buttonCount } = inputs;
  const axis =
    inputs.orientation === 'portrait'
      ? {
          viewportExtent: `${inputs.viewportHeight}px`,
          paletteExtent: inputs.paletteHeight,
          insets: `${safeAreaLength('top')} - ${safeAreaLength('bottom')}`,
        }
      : {
          viewportExtent: '100vw',
          paletteExtent: inputs.paletteWidth,
          insets: `${safeAreaLength('left')} - ${safeAreaLength('right')}`,
        };
  const fixedCost = fixedRowCost(orientation, buttonCount, axis.paletteExtent);
  const budget = `${axis.viewportExtent} - ${fixedCost}px - ${axis.insets}`;
  return `min(calc(var(${ACTION_BUTTON_BASE_PROPERTY}) * var(--action-btn-scale, 1)), calc((${budget}) / ${buttonCount}))`;
}

// Largest Button Size percentage the current screen can show without the
// render-time cap kicking in — the dynamic maximum of the Button Size slider in Settings, so the
// parent can't pick a size that would flow off the screen. Clamped to the
// slider's static range: on an absurdly small viewport the render cap (below)
// still bounds the actual size.
export function maxActionButtonScale(): number {
  const base = actionButtonBase(layout.orientation);
  const pct = Math.floor((availablePerButton(visibleActionButtonCount()) / base) * 100);
  return Math.min(ACTION_BUTTON_SCALE_MAX, Math.max(ACTION_BUTTON_SCALE_MIN, pct));
}

// Marks the point where Actions Panel CSS stops reading app.html's immutable
// first-paint seed from <html> and reads live state from the panel subtree.
export const ACTION_PANEL_LIVE_ATTRIBUTE = 'data-action-panel-live';

type BooleanSettingKey = {
  [K in keyof typeof settings]: (typeof settings)[K] extends boolean ? K : never;
}[keyof typeof settings];

// Every Actions Panel control a parent can switch off, mapped to the attribute
// that marks it off. app.html's inline boot script re-types these names as
// literals because it can't import (see publishActionPanelState below);
// app.html.test.ts diffs its list against this table.
export const CONTROL_OFF_ATTRIBUTES = {
  advancedControlsEnabled: 'data-off-adv',
  strokeWidthControlEnabled: 'data-off-stroke',
  crayonEnabled: 'data-off-crayon',
  magicBrushEnabled: 'data-off-magic',
  eraserEnabled: 'data-off-eraser',
  coloringBookEnabled: 'data-off-coloring',
  screenshotEnabled: 'data-off-screenshot',
  undoButtonEnabled: 'data-off-undo',
} as const satisfies Partial<Record<BooleanSettingKey, `data-off-${string}`>>;

const controlOffEntries = Object.entries(CONTROL_OFF_ATTRIBUTES) as [
  keyof typeof CONTROL_OFF_ATTRIBUTES,
  string,
][];

// The rest of the seeded vocabulary app.html's boot script re-types: the
// drawer's open state, and the brush the Brush Button wears.
export const DRAWER_OPEN_ATTRIBUTE = 'data-drawer-open';
export const BRUSH_ATTRIBUTE = 'data-brush';
export const SINGLE_BRUSH_ATTRIBUTE = 'data-single-brush';
export const NO_ACTIONS_ATTRIBUTE = 'data-no-actions';

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
  el.toggleAttribute(DRAWER_OPEN_ATTRIBUTE, drawerExpanded);
  for (const [key, attribute] of controlOffEntries) {
    el.toggleAttribute(attribute, !settings[key]);
  }
  const optionalBrushes = enabledOptionalBrushes();
  if (optionalBrushes.length === 1) {
    el.setAttribute(SINGLE_BRUSH_ATTRIBUTE, optionalBrushes[0]);
  } else {
    el.removeAttribute(SINGLE_BRUSH_ATTRIBUTE);
  }
  el.toggleAttribute(NO_ACTIONS_ATTRIBUTE, visibleActionButtonCount() === 0);
  // The Brush Button's face is the active brush's icon. All four icons are in
  // the DOM and CSS shows the one matching this attribute ({@html} icons can't
  // swap during hydration — see .claude/rules/svelte.md), absent for the
  // default pen so the raw prerendered HTML is already correct.
  if (toolState.brush === 'pen') el.removeAttribute(BRUSH_ATTRIBUTE);
  else el.setAttribute(BRUSH_ATTRIBUTE, toolState.brush);
  el.setAttribute(ACTION_PANEL_LIVE_ATTRIBUTE, '');
}

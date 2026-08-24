// Notch Band — paint the device's top safe-area inset (the notch / hole-punch
// strip behind the system clock) with the active drawing color, clearing it to
// the paper color when the eraser is selected.
//
// One reactive source of truth fans out to three rendering mechanisms, because
// no single one reaches the notch on every deployment target:
//   • CSS band       — an element sized to env(safe-area-inset-top). Paints the
//                      notch wherever web content draws under it: iOS native,
//                      the iOS standalone PWA (black-translucent), and native
//                      Android (edge-to-edge, enforced at targetSdk 35+).
//   • theme-color    — <meta name="theme-color">. The only thing that tints the
//                      Android web status bar (Chrome tab / installed PWA);
//                      ignored elsewhere, so harmless to set unconditionally.
//   • status-bar icons — native-only StatusBar.setStyle, to flip the system
//                      clock/battery light or dark for contrast on the band.
//
// All of the platform-independent decisions live here as pure functions so the
// four deployment targets and the color math are unit-testable without a DOM.

import { isLightColor } from '../colorRing';
// Type-only import — erased at build time, so this file keeps its no-runtime-
// plugin-import purity (no @capacitor/core reaches the pure layer).
import type { Orientation, Platform } from './index';
// Type-only — same purity guarantee as the Platform import above. The Style
// enum's *values* are passed in by the call site (NotchBand.svelte), not
// imported here, so this file never touches @capacitor/status-bar at runtime.
import type { Style, StatusBarPlugin } from '@capacitor/status-bar';

// Minimum top safe-area inset (CSS px) we treat as a real display cutout. Above
// it: iPhone notches / Dynamic Island (~44–59px) and Android hole-punches.
// Below it: a plain status bar or a bezel-camera iPad (~20–24px), which get no
// band. CSS insets can't perfectly separate an Android hole-punch from an iPad
// status bar (they overlap near ~24px); this threshold reliably excludes the
// bezel-iPad case and is the single knob to tune if a device misjudges.
export const NOTCH_INSET_THRESHOLD_PX = 30;

// Capacitor StatusBar.Style string values (mirrored here so the pure layer has
// no plugin import): 'DARK' = light icons (for a dark band), 'LIGHT' = dark
// icons (for a light band).
export type StatusBarStyle = 'DARK' | 'LIGHT';

// Screen edge the band paints along — the edge the display cutout currently
// sits on. The hole-punch is at the device's physical top, so it's the top edge
// in portrait and rotates to a side (left or right) in landscape.
export type NotchEdge = 'top' | 'left' | 'right';

// screen.orientation.angle values that put the device's natural top edge — and
// with it the cutout — on each side of the screen.
//
// The angle is the device's rotation counter-clockwise from natural, so 90 is a
// counter-clockwise quarter turn and carries the top edge to the LEFT. Settled
// against the W3C Screen Orientation spec, the WHATWG Compatibility Standard's
// window.orientation mapping, AOSP's Display.getRotation(), and current WebKit;
// docs/SAFE-AREA.md carries the citations and the one version that disagreed.
export const CUTOUT_LEFT_ANGLE = 90;
export const CUTOUT_RIGHT_ANGLE = 270;

export interface NotchBandInput {
  platform: Platform;
  native: boolean;
  orientation: Orientation;
  /** Measured env(safe-area-inset-top), in CSS px. */
  insetTop: number;
  /** Measured env(safe-area-inset-left), in CSS px. */
  insetLeft: number;
  /** Measured env(safe-area-inset-right), in CSS px. */
  insetRight: number;
  /**
   * screen.orientation.angle, or 0 where the API is absent. The only signal
   * that distinguishes the two landscape rotations when the insets cannot —
   * see landscapeBandEdges.
   */
  orientationAngle: number;
  /** Current drawing color, always a valid hex. */
  activeColor: string;
  eraser: boolean;
  /**
   * The theme-resolved paper color (PAPER_COLORS in lib/theme.ts). Shown while
   * the eraser is active: the notch sits over the paper, so the paper's own
   * tone reads as "no color" in light and dark alike.
   */
  paperColor: string;
}

export interface NotchBandState {
  /** CSS fill per edge; only the detected cutout edge can be non-transparent. */
  backgroundColors: Record<NotchEdge, string>;
  /** Value to write to <meta name="theme-color">. */
  themeColor: string;
  /** Native status-bar icon style, or null when no native call should be made. */
  statusBarStyle: StatusBarStyle | null;
  /**
   * Android native only: true to hide the system status bar, false to show it,
   * null to make no visibility call. We hide it in landscape (the long top edge
   * is precious drawing real estate) and leave the OS default in portrait.
   */
  statusBarHidden: boolean | null;
}

export function bandColor(activeColor: string, eraser: boolean, paperColor: string): string {
  return eraser ? paperColor : activeColor;
}

export function hasNotch(insetTop: number): boolean {
  return insetTop >= NOTCH_INSET_THRESHOLD_PX;
}

export function statusBarStyleForBand(color: string): StatusBarStyle {
  return isLightColor(color) ? 'LIGHT' : 'DARK';
}

// Every edge the band fills. In portrait the hole-punch is at the top and the
// question is trivial. Landscape is where it is not: the cutout moves onto a
// side, and the deepest side inset is NOT reliably the cutout.
//
// Two failures taught this rule, both of them "deepest side wins" going wrong:
//   • iOS insets BOTH landscape sides with the same value whichever side the
//     cutout is physically on, so the comparison always resolved right and was
//     wrong on one of the two rotations.
//   • Android with 3-button navigation moves the nav bar to the side opposite
//     the camera, where it is deeper than the cutout — so the comparison picked
//     the nav bar in both rotations and painted the drawing colour behind the
//     back/home/recents buttons.
//
// So: when the two sides report the same inset, paint both. That is exactly the
// case where the app cannot tell them apart, and it costs nothing to be safe —
// both strips are already outside the content box, so neither is claimable
// screen we would be spending. When they differ, the sides are distinguishable
// and the rotation angle says which one the cutout is on.
//
// An angle that names neither side (0, 180, or no Screen Orientation API at
// all) leaves an asymmetric pair unresolved, and there the band paints nothing.
// A band on the wrong edge is worse than no band: it spends claimable screen AND
// leaves the strip it exists to fill bare.
function landscapeBandEdges(input: NotchBandInput): NotchEdge[] {
  if (input.insetLeft === input.insetRight) {
    return hasNotch(input.insetLeft) ? ['left', 'right'] : [];
  }
  if (input.orientationAngle === CUTOUT_LEFT_ANGLE) {
    return hasNotch(input.insetLeft) ? ['left'] : [];
  }
  if (input.orientationAngle === CUTOUT_RIGHT_ANGLE) {
    return hasNotch(input.insetRight) ? ['right'] : [];
  }
  return [];
}

export function bandEdges(input: NotchBandInput): NotchEdge[] {
  if (input.orientation === 'landscape') return landscapeBandEdges(input);
  return hasNotch(input.insetTop) ? ['top'] : [];
}

// Android landscape: hide the status bar to reclaim the long top edge as canvas.
// Independent of whether a cutout exists — the saved real estate is the point.
// Only Android native; iOS and the web targets keep their default status bar.
export function statusBarHiddenFor(input: NotchBandInput): boolean | null {
  if (!input.native || input.platform !== 'android') return null;
  return input.orientation === 'landscape';
}

// Plugin-call glue for the native status-bar effect in NotchBand.svelte: the
// `StatusBarStyle` → `Style` enum translation and the hide/show dispatch, both
// injected (`bar`, `statusBarStyleEnum`) so this stays a pure function the
// component's dynamic-import call site drives.
export function applyStatusBar(
  style: StatusBarStyle | null,
  hidden: boolean | null,
  bar: Pick<StatusBarPlugin, 'setStyle' | 'hide' | 'show'>,
  statusBarStyleEnum: { Dark: Style; Light: Style }
): void {
  if (style) {
    bar
      .setStyle({ style: style === 'DARK' ? statusBarStyleEnum.Dark : statusBarStyleEnum.Light })
      .catch(() => {});
  }
  if (hidden !== null) {
    (hidden ? bar.hide() : bar.show()).catch(() => {});
  }
}

export function computeNotchBandState(input: NotchBandInput): NotchBandState {
  const color = bandColor(input.activeColor, input.eraser, input.paperColor);
  const edges = bandEdges(input);
  const show = edges.length > 0;
  return {
    backgroundColors: {
      top: edges.includes('top') ? color : 'transparent',
      left: edges.includes('left') ? color : 'transparent',
      right: edges.includes('right') ? color : 'transparent',
    },
    // Always reflect the color in theme-color — it's the Android-web mechanism
    // and a no-op everywhere else.
    themeColor: color,
    // Only flip the native status-bar icons when we're actually painting a band
    // (a real cutout) on a native build; otherwise leave the system default.
    statusBarStyle: input.native && show ? statusBarStyleForBand(color) : null,
    statusBarHidden: statusBarHiddenFor(input),
  };
}

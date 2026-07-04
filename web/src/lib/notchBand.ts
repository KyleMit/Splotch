// Notch Band — paint the device's top safe-area inset (the notch / hole-punch
// strip behind the system clock) with the active drawing color, clearing it to
// paper-white when the eraser is selected.
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

import { isLightColor } from './colorRing';
// Type-only import — erased at build time, so this file keeps its no-runtime-
// plugin-import purity (no @capacitor/core reaches the pure layer).
import type { Platform } from './platform';

// Shown in the band (and as the theme color) while the eraser is active. The
// notch sits over white paper, so paper-white reads as "no color".
export const ERASER_BAND_COLOR = '#ffffff';

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

export type Orientation = 'portrait' | 'landscape';

// Screen edge the band paints along — the edge the display cutout currently
// sits on. The hole-punch is at the device's physical top, so it's the top edge
// in portrait and rotates to a side (left or right) in landscape.
export type NotchEdge = 'top' | 'left' | 'right';

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
  /** Current drawing color, always a valid hex. */
  activeColor: string;
  eraser: boolean;
}

export interface NotchBandState {
  /** Paint the colored CSS band? False on devices without a real cutout. */
  show: boolean;
  /** Edge to paint the band along (the edge the cutout sits on). */
  edge: NotchEdge;
  /** Band fill (and theme-color) value. */
  color: string;
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

export function bandColor(activeColor: string, eraser: boolean): string {
  return eraser ? ERASER_BAND_COLOR : activeColor;
}

export function hasNotch(insetTop: number): boolean {
  return insetTop >= NOTCH_INSET_THRESHOLD_PX;
}

export function statusBarStyleForBand(color: string): StatusBarStyle {
  return isLightColor(color) ? 'LIGHT' : 'DARK';
}

// Which edge holds the cutout, and how deep its inset is. In portrait the
// hole-punch is at the top. In landscape the device's physical top edge rotates
// to a side, so the cutout inset moves off the top onto the left or right —
// whichever side the rotation landed it on (read from the measured insets). The
// long top edge in landscape is never the cutout, so it gets no band.
export function cutoutEdge(input: NotchBandInput): { edge: NotchEdge; inset: number } {
  if (input.orientation === 'landscape') {
    return input.insetRight >= input.insetLeft
      ? { edge: 'right', inset: input.insetRight }
      : { edge: 'left', inset: input.insetLeft };
  }
  return { edge: 'top', inset: input.insetTop };
}

// Android landscape: hide the status bar to reclaim the long top edge as canvas.
// Independent of whether a cutout exists — the saved real estate is the point.
// Only Android native; iOS and the web targets keep their default status bar.
export function statusBarHiddenFor(input: NotchBandInput): boolean | null {
  if (!input.native || input.platform !== 'android') return null;
  return input.orientation === 'landscape';
}

export function computeNotchBandState(input: NotchBandInput): NotchBandState {
  const color = bandColor(input.activeColor, input.eraser);
  const { edge, inset } = cutoutEdge(input);
  const show = hasNotch(inset);
  return {
    show,
    edge,
    color,
    // Always reflect the color in theme-color — it's the Android-web mechanism
    // and a no-op everywhere else.
    themeColor: color,
    // Only flip the native status-bar icons when we're actually painting a band
    // (a real cutout) on a native build; otherwise leave the system default.
    statusBarStyle: input.native && show ? statusBarStyleForBand(color) : null,
    statusBarHidden: statusBarHiddenFor(input),
  };
}

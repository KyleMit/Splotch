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

export type Platform = 'web' | 'android' | 'ios';

export interface NotchBandInput {
  platform: Platform;
  native: boolean;
  /** Measured env(safe-area-inset-top), in CSS px. */
  insetTop: number;
  /** Current drawing color, always a valid hex. */
  activeColor: string;
  eraser: boolean;
}

export interface NotchBandState {
  /** Paint the colored CSS band? False on devices without a real cutout. */
  show: boolean;
  /** Band fill (and theme-color) value. */
  color: string;
  /** Value to write to <meta name="theme-color">. */
  themeColor: string;
  /** Native status-bar icon style, or null when no native call should be made. */
  statusBarStyle: StatusBarStyle | null;
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

export function computeNotchBandState(input: NotchBandInput): NotchBandState {
  const color = bandColor(input.activeColor, input.eraser);
  const show = hasNotch(input.insetTop);
  return {
    show,
    color,
    // Always reflect the color in theme-color — it's the Android-web mechanism
    // and a no-op everywhere else.
    themeColor: color,
    // Only flip the native status-bar icons when we're actually painting a band
    // (a real cutout) on a native build; otherwise leave the system default.
    statusBarStyle: input.native && show ? statusBarStyleForBand(color) : null
  };
}

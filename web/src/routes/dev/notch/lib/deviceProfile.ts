import type { SafeAreaInsets } from '$lib/platform/safeArea';
import type { Orientation } from './orientations';

// A device class is one distinct safe-area profile, not one SKU: several models
// that report the same insets at the same viewport collapse into a single entry,
// because a second phone with identical numbers tests nothing the first didn't.
// The point of the harness is coverage of the layout cases, not of the market.

export type Platform = 'ios' | 'android';

// Where the page's insets come from, which changes the numbers as much as the
// hardware does — Safari's own chrome occupies the notch band, so a notched
// iPhone reports zero insets in a browser tab and its real ones in a PWA.
export type Surface = 'browser' | 'pwa' | 'native';

export type CutoutKind = 'none' | 'notch' | 'dynamic-island' | 'hole-punch' | 'teardrop';

// The physical cutout's shape, in portrait device coordinates. The harness draws
// this on the chrome overlay so the illustration shows where the camera actually
// is — which, on iOS landscape, is the one thing the insets themselves cannot
// tell you (left and right report identically; see SYMMETRIC_LANDSCAPE_NOTE).
export interface Cutout {
  kind: CutoutKind;
  /** 0 = flush against the device's left edge, 1 = its right edge. */
  centerX: number;
  widthPx: number;
  heightPx: number;
  /** Gap between the device's top edge and the cutout, 0 for a notch. */
  topPx: number;
}

export const NO_CUTOUT: Cutout = { kind: 'none', centerX: 0.5, widthPx: 0, heightPx: 0, topPx: 0 };

export type Confidence = 'high' | 'medium' | 'low';

export interface DeviceProfile {
  id: string;
  label: string;
  models: string[];
  platform: Platform;
  surface: Surface;
  /** Portrait CSS viewport, in px. Landscape is this transposed. */
  viewport: { width: number; height: number };
  /** Display corner radius in CSS px — the reason a flat-screened iPad still insets. */
  cornerRadiusPx: number;
  cutout: Cutout;
  /**
   * Insets per orientation. An orientation absent from this map is one the
   * device does not offer: no Face ID iPhone rotates to upside-down portrait,
   * so the harness renders no tile for it rather than a plausible guess.
   */
  insets: Partial<Record<Orientation, SafeAreaInsets>>;
  confidence: Confidence;
  notes: string;
  sources: string[];
}

export const SYMMETRIC_LANDSCAPE_NOTE =
  'iOS insets BOTH sides in landscape with the same value, whichever side the cutout is ' +
  'physically on, so CSS cannot tell the two landscape rotations apart.';

export function insetsFor(
  profile: DeviceProfile,
  orientation: Orientation
): SafeAreaInsets | undefined {
  return profile.insets[orientation];
}

export function supportedOrientations(profile: DeviceProfile): Orientation[] {
  return Object.keys(profile.insets) as Orientation[];
}

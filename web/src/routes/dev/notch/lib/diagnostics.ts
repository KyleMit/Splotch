import { PAPER_COLORS } from '$lib/theme';
import {
  bandEdges,
  hasNotch,
  statusBarHiddenFor,
  type NotchBandInput,
  type NotchEdge,
} from '$lib/platform/notchBand';
import { SAFE_AREA_EDGES, type SafeAreaInsets } from '$lib/platform/safeArea';
import type { DeviceProfile } from './deviceProfile';
import { ORIENTATION_ANGLES, isLandscape, type Orientation } from './orientations';

// What the app decides for a scenario, next to where the hardware actually is.
// Both halves come from production code — bandEdges and hasNotch are the same
// functions NotchBand.svelte drives — so a tile's verdict cannot drift from the
// app's behaviour without this file failing to compile or its test failing.

export type ScreenEdge = NotchEdge | 'bottom';

export interface Diagnosis {
  /** Edges the Notch Band paints. Empty when it paints nothing. */
  bandEdges: NotchEdge[];
  /** Edge the physical cutout is on for this rotation, or null with no cutout. */
  cutoutScreenEdge: ScreenEdge | null;
  /** Something is painted, but not on the edge the cutout is on. */
  missesCutout: boolean;
  /** Inset deep enough to paint, on a device that has no cutout at all. */
  insetWithoutCutout: boolean;
}

const ANGLE_TO_EDGE = {
  0: 'top',
  90: 'left',
  180: 'bottom',
  270: 'right',
} as const satisfies Record<(typeof ORIENTATION_ANGLES)[Orientation], ScreenEdge>;

function bandInputFor(
  profile: DeviceProfile,
  orientation: Orientation,
  insets: SafeAreaInsets
): NotchBandInput {
  return {
    platform: profile.platform === 'android' ? 'android' : 'ios',
    native: profile.surface === 'native',
    orientation: isLandscape(orientation) ? 'landscape' : 'portrait',
    insetTop: insets.top,
    insetLeft: insets.left,
    insetRight: insets.right,
    // The rotation this tile depicts, in the same frame of reference the OS
    // reports: a device rotated counter-clockwise onto its left edge is 90.
    orientationAngle: ORIENTATION_ANGLES[orientation],
    activeColor: '#000000',
    eraser: false,
    paperColor: PAPER_COLORS.light,
  };
}

// The insets the app lays out against, which are not always the ones the device
// reports. On Android native in landscape the app hides the status bar to
// reclaim the long top edge (statusBarHiddenFor), and the inset that bar
// contributed goes with it — so a preview built from the raw device numbers
// shows a strip of padding the shipped app does not have.
//
// The device numbers in DEVICE_PROFILES stay untouched research; this is the
// app's own policy applied on top of them, by the app's own function, so the
// two cannot drift.
export function appliedInsets(
  profile: DeviceProfile,
  orientation: Orientation
): SafeAreaInsets | undefined {
  const insets = profile.insets[orientation];
  if (!insets) return undefined;
  const hidden = statusBarHiddenFor(bandInputFor(profile, orientation, insets));
  return hidden ? { ...insets, top: 0 } : insets;
}

export function diagnose(profile: DeviceProfile, orientation: Orientation): Diagnosis | null {
  const insets = appliedInsets(profile, orientation);
  if (!insets) return null;

  const painted = bandEdges(bandInputFor(profile, orientation, insets));

  const cutoutScreenEdge =
    profile.cutout.kind === 'none' ? null : ANGLE_TO_EDGE[ORIENTATION_ANGLES[orientation]];

  return {
    bandEdges: painted,
    cutoutScreenEdge,
    missesCutout:
      painted.length > 0 &&
      cutoutScreenEdge !== null &&
      !painted.includes(cutoutScreenEdge as NotchEdge),
    insetWithoutCutout: painted.length > 0 && cutoutScreenEdge === null,
  };
}

// Why the band the app paints differs from the band the hardware wants. Every
// disagreement has to name one of these; an unclassifiable one is a new defect,
// which is what makes this a ratchet rather than an exclusion list. A hardcoded
// list of known-bad profiles would go stale silently the moment a device was
// added that fell into the same trap.
//
// The two causes this harness originally recorded — a symmetric landscape pair
// resolving to the wrong side, and a 3-button nav bar outbidding the cutout —
// are absent because landscapeBandEdges no longer has them. What is left is
// hardware the app declines to paint, and surfaces that report nothing to paint.
export type BandGapCause =
  | 'cutout-below-threshold'
  | 'platform-paints-no-band'
  | 'rotation-angle-unavailable';

export const BAND_GAP_EXPLANATIONS = {
  'cutout-below-threshold':
    'A real cutout whose inset sits under NOTCH_INSET_THRESHOLD_PX, so the app declines to paint it rather than risk banding a plain status bar.',
  'platform-paints-no-band':
    'The surface reports no inset on the cutout edge at all, so there is nothing for a CSS band to fill.',
  'rotation-angle-unavailable':
    'The two sides differ, so only the rotation angle could pick one — and no Screen Orientation API reported a landscape angle.',
} as const satisfies Record<BandGapCause, string>;

export interface BandVerdict {
  /** The edge a band ought to cover: where the cutout actually is. */
  expected: ScreenEdge | null;
  /** The edges the app paints, from its own bandEdges(). */
  painted: NotchEdge[];
  /** Set only when the two disagree. Null with a disagreement means unexplained. */
  cause: BandGapCause | null;
}

export function bandVerdict(profile: DeviceProfile, orientation: Orientation): BandVerdict | null {
  const diagnosis = diagnose(profile, orientation);
  const insets = appliedInsets(profile, orientation);
  if (!diagnosis || !insets) return null;

  const { cutoutScreenEdge: expected, bandEdges: painted } = diagnosis;
  const covered =
    expected === null ? painted.length === 0 : painted.includes(expected as NotchEdge);
  if (covered) return { expected, painted, cause: null };

  return { expected, painted, cause: classifyGap(profile, orientation, expected, insets) };
}

function classifyGap(
  profile: DeviceProfile,
  orientation: Orientation,
  expected: ScreenEdge | null,
  insets: SafeAreaInsets
): BandGapCause | null {
  // Painted somewhere with no cutout anywhere — not a gap this explains.
  if (expected === null || expected === 'bottom') return null;
  if (insets[expected] === 0) return 'platform-paints-no-band';
  if (!hasNotch(insets[expected])) return 'cutout-below-threshold';
  if (isLandscape(orientation) && insets.left !== insets.right) {
    return 'rotation-angle-unavailable';
  }
  return null;
}

/** The deepest inset on an edge the band does not cover — space paid for, not reclaimed. */
export function unreclaimedInsetPx(profile: DeviceProfile, orientation: Orientation): number {
  const insets = appliedInsets(profile, orientation);
  if (!insets) return 0;
  const painted = diagnose(profile, orientation)?.bandEdges ?? [];
  return SAFE_AREA_EDGES.filter((edge) => !painted.includes(edge as NotchEdge)).reduce(
    (deepest, edge) => Math.max(deepest, insets[edge]),
    0
  );
}

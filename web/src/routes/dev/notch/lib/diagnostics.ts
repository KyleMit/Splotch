import { PAPER_COLORS } from '$lib/theme';
import { cutoutEdge, hasNotch, type NotchEdge } from '$lib/platform/notchBand';
import type { DeviceProfile } from './deviceProfile';
import { ORIENTATION_ANGLES, isLandscape, type Orientation } from './orientations';

// What the app decides for a scenario, next to where the hardware actually is.
// Both halves come from production code — cutoutEdge and hasNotch are the same
// functions NotchBand.svelte drives — so a tile's verdict cannot drift from the
// app's behaviour without this file failing to compile or its test failing.

export type ScreenEdge = NotchEdge | 'bottom';

export interface Diagnosis {
  /** Edge the Notch Band paints, or null when it paints nothing. */
  bandEdge: NotchEdge | null;
  /** Edge the physical cutout is on for this rotation, or null with no cutout. */
  cutoutScreenEdge: ScreenEdge | null;
  /** The band is painted on a different edge from the cutout it exists to fill. */
  wrongSide: boolean;
  /** Inset deep enough to be worth painting, on a device that has no cutout. */
  insetWithoutCutout: boolean;
}

const ANGLE_TO_EDGE = {
  0: 'top',
  90: 'left',
  180: 'bottom',
  270: 'right',
} as const satisfies Record<(typeof ORIENTATION_ANGLES)[Orientation], ScreenEdge>;

export function diagnose(profile: DeviceProfile, orientation: Orientation): Diagnosis | null {
  const insets = profile.insets[orientation];
  if (!insets) return null;

  const input = {
    platform: profile.platform === 'android' ? ('android' as const) : ('ios' as const),
    native: profile.surface === 'native',
    orientation: isLandscape(orientation) ? ('landscape' as const) : ('portrait' as const),
    insetTop: insets.top,
    insetLeft: insets.left,
    insetRight: insets.right,
    activeColor: '#000000',
    eraser: false,
    paperColor: PAPER_COLORS.light,
  };

  const { edge, inset } = cutoutEdge(input);
  const painted = hasNotch(inset);
  const cutoutScreenEdge =
    profile.cutout.kind === 'none' ? null : ANGLE_TO_EDGE[ORIENTATION_ANGLES[orientation]];

  return {
    bandEdge: painted ? edge : null,
    cutoutScreenEdge,
    // A band on the wrong edge is worse than no band: it paints the drawing
    // colour over claimable screen while leaving the cutout strip unpainted.
    wrongSide: painted && cutoutScreenEdge !== null && edge !== cutoutScreenEdge,
    insetWithoutCutout: painted && cutoutScreenEdge === null,
  };
}

/** The deepest inset on an edge with no cutout behind it — space paid for, not reclaimed. */
export function unreclaimedInsetPx(profile: DeviceProfile, orientation: Orientation): number {
  const insets = profile.insets[orientation];
  if (!insets) return 0;
  const diagnosis = diagnose(profile, orientation);
  const claimed = diagnosis?.bandEdge;
  return (['top', 'right', 'bottom', 'left'] as const)
    .filter((edge) => edge !== claimed)
    .reduce((deepest, edge) => Math.max(deepest, insets[edge]), 0);
}

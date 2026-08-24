// The four ways a device can be held, named with Apple's UIDeviceOrientation
// vocabulary because it is the only widely-used naming that is unambiguous
// about which physical edge ends up where:
//
//   landscape-left  — home button / indicator on the RIGHT, so the device's
//                     physical top edge (and any cutout) lands on the LEFT.
//   landscape-right — the mirror: cutout on the RIGHT.
//
// "Clockwise" and "counter-clockwise" describe the rotation rather than the
// result, and flip meaning depending on whether you rotate the device or the
// image, which is exactly the confusion this harness exists to remove.
export const ORIENTATIONS = [
  'portrait',
  'landscape-left',
  'landscape-right',
  'portrait-upside-down',
] as const;

export type Orientation = (typeof ORIENTATIONS)[number];

export const ORIENTATION_LABELS = {
  portrait: 'Portrait',
  'landscape-left': 'Landscape · cutout left',
  'landscape-right': 'Landscape · cutout right',
  'portrait-upside-down': 'Portrait upside-down',
} as const satisfies Record<Orientation, string>;

// screen.orientation.angle for each pose. The angle is the device's rotation
// COUNTER-clockwise from natural, so landscape-left — the device turned
// counter-clockwise onto its left edge, carrying the cutout there — is 90.
//
// The chrome overlay also rotates the portrait-space cutout geometry by this
// much to place it on screen, which works out because rotating the device
// counter-clockwise rotates its contents clockwise by the same amount.
export const ORIENTATION_ANGLES = {
  portrait: 0,
  'landscape-left': 90,
  'landscape-right': 270,
  'portrait-upside-down': 180,
} as const satisfies Record<Orientation, number>;

export function isLandscape(orientation: Orientation): boolean {
  return orientation === 'landscape-left' || orientation === 'landscape-right';
}

export function isOrientation(value: string | null): value is Orientation {
  return ORIENTATIONS.includes(value as Orientation);
}

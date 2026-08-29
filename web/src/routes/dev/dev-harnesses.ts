export interface DevHarness {
  href: string;
  name: string;
  blurb: string;
}

export const DEV_HARNESSES: DevHarness[] = [
  {
    href: '/dev/engine',
    name: 'Drawing engine',
    blurb: 'Bare canvas harness driven by the Playwright specs.',
  },
  {
    href: '/dev/notch',
    name: 'Notch & safe area',
    blurb:
      'Every distinct env(safe-area-inset-*) profile, each orientation the device offers, with the live HUD laid out under those insets and the hardware drawn over it.',
  },
  {
    href: '/dev/gpu-crayon',
    name: 'GPU crayon',
    blurb:
      'Three GPU geometry strategies — stamped tip, analytic (Ciallo) and SDF polyline — over the wax model ported from crayonBrush.ts, with a scripted replay that times each.',
  },
  {
    href: '/dev/store-frames',
    name: 'Store frames',
    blurb:
      'The live store-screenshot compositions gen:store-assets renders — every marketing page per store slot, hot-reloading for design iteration.',
  },
];

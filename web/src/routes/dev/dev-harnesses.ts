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
    href: '/dev/store-frames',
    name: 'Store frames',
    blurb:
      'The live store-screenshot compositions gen:store-assets renders — every marketing page per store slot, hot-reloading for design iteration.',
  },
];

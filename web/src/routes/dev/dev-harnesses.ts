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
];

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
    href: '/dev/ai-timer',
    name: 'AI render timer',
    blurb: 'Debug view for the generation timer animation.',
  },
];

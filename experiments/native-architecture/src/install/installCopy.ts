import type { InstallDeviceOs } from './installPolicy';

export { INSTALL_PROMPT_COPY } from '../../../../web/src/lib/installPromptCopy';

// The shipping Install Banner and Settings install guide author these sentences in
// Svelte markup around inline icons, so they are spoken here as plain text;
// tools/tests/native-web-install-drift.test.mjs fails when the two diverge.
export const INSTALL_BANNER_COPY = {
  install: 'Install',
  showHint: 'How?',
  hideHint: 'Hide',
  dismiss: 'Not now',
  parting: 'No rush — these steps are always in Settings.',
  androidHint: 'Open the three-dot menu, then tap "Install app" or "Add to Home screen".',
} as const;

export function iosBannerSteps(shareLocation: string) {
  return [
    `Tap Share ${shareLocation}.`,
    'Choose Add to Home Screen.',
    "Don't see it? Tap View More first.",
  ];
}

export const INSTALL_GUIDE_COPY = {
  title: 'Install as App',
  oneTap: 'Install Splotch',
  oneTapHint: 'One tap — your browser will do the rest.',
  osLabel: { ios: 'iOS', android: 'Android', desktop: 'Desktop' } satisfies Record<
    InstallDeviceOs,
    string
  >,
  openInSafari: "Open this page in Safari — the steps below are Safari's",
  desktopNote: 'Firefox has no install of its own, so it keeps Splotch in a tab — that works too.',
} as const;

export function installGuideSteps(os: InstallDeviceOs, shareLocation: string) {
  switch (os) {
    case 'ios':
      return [
        `Tap the Share button ${shareLocation}`,
        'Scroll and tap "Add to Home Screen"',
        'Tap "Add" in the top right',
        'Launch from your home screen for fullscreen mode',
      ];
    case 'android':
      return [
        'Tap the menu (three dots)',
        'Tap "Install app" or "Add to Home screen"',
        'Follow the prompts',
        'Launch from your home screen for fullscreen mode',
      ];
    case 'desktop':
      return [
        'In Chrome or Edge, click the install icon at the end of the address bar — or open the browser menu and choose "Install Splotch"',
        'In Safari on macOS Sonoma or later, choose File → Add to Dock',
        'Follow the prompts',
        'Launch it from your dock, desktop, or taskbar for fullscreen mode',
      ];
  }
}

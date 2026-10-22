import type { InstallDeviceOs } from './installPolicy';

// The two platforms that own an app lock (Guided Access, App Pinning).
export type LockOs = Exclude<InstallDeviceOs, 'desktop'>;
import { spokenInstallText, strong, text, type InstallTextPart } from './installCopy';

// The Settings install guide's words, which shipping authors in SetupInstructions.svelte markup;
// tools/tests/native-web-install-drift.test.mjs fails when they diverge. Apart from the banner's
// sentences because the guide loads with Settings and the banner in its own web chunk, and a
// module both import is hoisted onto the startup path.
export const INSTALL_GUIDE_COPY = {
  title: 'Install as App',
  oneTap: 'Install Splotch',
  oneTapHint: 'One tap — your browser will do the rest.',
  osLabel: { ios: 'iOS', android: 'Android', desktop: 'Desktop' } satisfies Record<
    InstallDeviceOs,
    string
  >,
  // The second step: the lock to turn on, or, on a computer with none, what a parent can do instead.
  lockTitle: {
    ios: 'Enable Guided Access',
    android: 'Enable App Pinning',
    desktop: 'Keep kids in the app',
  } satisfies Record<InstallDeviceOs, string>,
  // An installed app whose lock is already engaged: the title confirms it, over the way back out.
  lockedTitle: {
    ios: 'Guided Access is on',
    android: 'App Pinning is on',
  } satisfies Record<LockOs, string>,
  desktopNote: 'Firefox has no install of its own, so it keeps Splotch in a tab — that works too.',
  desktopLockNote:
    'A computer has no Guided Access or App Pinning to turn on — nothing locks it to one app. These come closest:',
} as const;

// The Settings install checklist for one device family, in SetupInstructions.svelte's words and
// bold runs. Its steps are Safari's on iOS, so a parent in another iOS browser is sent there first.
export function installGuideStepParts(
  os: InstallDeviceOs,
  shareLocation: string,
  outsideSafari: boolean
): readonly (readonly InstallTextPart[])[] {
  switch (os) {
    case 'ios':
      return [
        ...(outsideSafari
          ? [
              [
                text('Open this page in '),
                strong('Safari'),
                text(" — the steps below are Safari's"),
              ],
            ]
          : []),
        [
          text('Tap the '),
          { kind: 'term', icon: 'share-ios', text: ' Share' },
          text(` button ${shareLocation}`),
        ],
        [text('Scroll and tap '), strong('"Add to Home Screen"')],
        [text('Tap '), strong('"Add"'), text(' in the top right')],
        [text('Launch from your home screen for fullscreen mode')],
      ];
    case 'android':
      return [
        [text('Tap the '), strong('menu'), text(' (three dots)')],
        [text('Tap '), strong('"Install app"'), text(' or '), strong('"Add to Home screen"')],
        [text('Follow the prompts')],
        [text('Launch from your home screen for fullscreen mode')],
      ];
    case 'desktop':
      return [
        [
          text('In Chrome or Edge, click the '),
          strong('install'),
          text(' icon at the end of the address bar — or open the browser '),
          strong('menu'),
          text(' and choose '),
          strong('"Install Splotch"'),
        ],
        [text('In Safari on macOS Sonoma or later, choose '), strong('File → Add to Dock')],
        [text('Follow the prompts')],
        [text('Launch it from your dock, desktop, or taskbar for fullscreen mode')],
      ];
  }
}

// The lock steps: Guided Access on iOS, App Pinning on Android, and on a computer the nearest
// substitutes, which are suggestions rather than an ordered procedure.
export function lockGuideStepParts(os: InstallDeviceOs): readonly (readonly InstallTextPart[])[] {
  switch (os) {
    case 'ios':
      return [
        [text('Go to '), strong('Settings → Accessibility → Guided Access')],
        [text('Turn on '), strong('Guided Access')],
        [text('Set a passcode')],
        [text('Open Splotch and triple-click the side button')],
        [text('Tap '), strong('Start'), text(' to lock the app')],
        [text('Triple-click and enter passcode to exit')],
      ];
    case 'android':
      return [
        [text('Go to '), strong('Settings → Security → App Pinning')],
        [text('Turn on '), strong('App Pinning')],
        [text('Open Splotch and tap the '), strong('Recent Apps'), text(' button')],
        [text('Swipe up on Splotch and tap the '), strong('Pin'), text(' icon')],
        [text('Tap '), strong('Start'), text(' to lock the app')],
        [text('Long-press Back + Recent Apps to exit')],
      ];
    case 'desktop':
      return [
        [text('Install Splotch above, so it opens in its own window with no tabs or address bar')],
        [
          text('Put the browser in full screen — '),
          strong('F11'),
          text(' on Windows and Linux, '),
          strong('Control-Command-F'),
          text(' on a Mac'),
        ],
        [text('Stay nearby — a keyboard can leave the app at any time')],
      ];
  }
}

// How to leave the lock that is engaged, shown in place of the steps that turn it on.
export function exitGuideStepParts(os: LockOs): readonly (readonly InstallTextPart[])[] {
  return os === 'ios'
    ? [
        [text('Triple-click the '), strong('side button'), text(' (or Home button)')],
        [text('Enter your Guided Access passcode')],
        [text('Tap '), strong('End'), text(' in the top left')],
      ]
    : [
        [
          text('Touch and hold '),
          strong('Back'),
          text(' + '),
          strong('Recent Apps'),
          text(' together'),
        ],
        [text('(or swipe up and hold, then tap '), strong('Unpin'), text(')')],
        [text('Splotch is now unlocked')],
      ];
}

export function exitGuideSteps(os: LockOs) {
  return exitGuideStepParts(os).map(spokenInstallText);
}

export function lockGuideSteps(os: InstallDeviceOs) {
  return lockGuideStepParts(os).map(spokenInstallText);
}

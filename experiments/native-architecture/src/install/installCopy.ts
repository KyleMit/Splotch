import type { NativeIconName } from '../rsdDrawing/icons.generated';

export { INSTALL_PROMPT_COPY } from '../../../../web/src/lib/installPromptCopy';

// One run of a banner sentence. A term is the bold, unbroken icon-and-word name of a control the
// parent looks for: `spoken` is read before its word but never shown, and `textInk` paints the
// icon in the term's own ink, since that glyph stands in for a word.
export type InstallTextPart =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'icon'; icon: NativeIconName }
  | { kind: 'term'; icon: NativeIconName; text: string; spoken?: string; textInk?: boolean };

export const text = (value: string): InstallTextPart => ({ kind: 'text', text: value });
export const strong = (value: string): InstallTextPart => ({ kind: 'strong', text: value });

// What a sentence reads as: its words and spoken-only text without its icons, with the space a
// term keeps between its icon and its word collapsed as HTML collapses it.
export function spokenInstallText(parts: readonly InstallTextPart[]) {
  return parts
    .map((part) => {
      if (part.kind === 'icon') return '';
      if (part.kind === 'term') return (part.spoken ?? '') + part.text;
      return part.text;
    })
    .join('')
    .replace(/\s+/g, ' ');
}

// The shipping Install Banner authors these sentences in Svelte markup around inline icons; tools/tests/native-web-install-drift.test.mjs fails when the
// words, or the icon beside each term, diverge.
export const INSTALL_BANNER_PARTS = {
  parting: [
    text('No rush — these steps are always in '),
    { kind: 'icon', icon: 'settings' },
    strong('Settings'),
    text('.'),
  ],
  androidHint: [
    text('Open the '),
    { kind: 'term', icon: 'more-vert', text: ' menu', spoken: 'three-dot', textInk: true },
    text(', then tap '),
    strong('"Install app"'),
    text(' or '),
    strong('"Add to Home screen"'),
    text('.'),
  ],
} as const satisfies Record<string, readonly InstallTextPart[]>;

export const INSTALL_BANNER_COPY = {
  install: 'Install',
  showHint: 'How?',
  hideHint: 'Hide',
  dismiss: 'Not now',
  parting: spokenInstallText(INSTALL_BANNER_PARTS.parting),
  androidHint: spokenInstallText(INSTALL_BANNER_PARTS.androidHint),
} as const;

export function iosBannerStepParts(shareLocation: string): readonly (readonly InstallTextPart[])[] {
  return [
    [text('Tap '), { kind: 'term', icon: 'share-ios', text: ' Share' }, text(` ${shareLocation}.`)],
    [
      text('Choose '),
      { kind: 'term', icon: 'add-homescreen', text: ' Add to Home Screen' },
      text('.'),
    ],
    [
      text("Don't see it? Tap "),
      { kind: 'term', icon: 'chevron-down', text: ' View More' },
      text(' first.'),
    ],
  ];
}

export function iosBannerSteps(shareLocation: string) {
  return iosBannerStepParts(shareLocation).map(spokenInstallText);
}

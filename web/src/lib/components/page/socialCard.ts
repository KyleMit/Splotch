import { SITE_ORIGIN } from '../../siteUrl.ts';
import shareCards from './shareCards.json' with { type: 'json' };

// The home page's link-preview card, which SocialCard.svelte renders when a
// route passes nothing. The home route's <title> and meta description read
// the same object, so the tab, the search snippet, and the card agree by
// import. app.html carries none of them (siteUrl.test.ts keeps it that way).
export const HOME_CARD = {
  path: '/',
  title: 'Splotch - Drawing for Kids',
  description: 'A simple drawing app for toddlers',
} as const;

// Each page's tab-independent card: its link-preview title and its meta description. The Svelte
// routes and the React Native web documents (tools/migration/build-native-web.mjs) both read these.
export const PAGE_CARDS = {
  '/privacy': {
    path: '/privacy',
    title: 'Splotch Privacy Policy',
    description: "Splotch's privacy policy: no ads, no tracking, no accounts, and no analytics.",
  },
  '/changelog': {
    path: '/changelog',
    title: 'Splotch Changelog',
    description: 'The complete Splotch changelog, with notes for every public release.',
  },
  '/feedback': {
    path: '/feedback',
    title: 'Send Feedback to Splotch',
    description:
      'Report a bug or suggest an idea for Splotch, the drawing app for toddlers. No account needed.',
  },
  '/beta': {
    path: '/beta',
    title: 'Join the Splotch Beta',
    description:
      "How to become a Splotch beta tester on Android via Google Play, or on iPhone and iPad via Apple's TestFlight.",
  },
  '/design': {
    path: '/design',
    title: 'Splotch Design System',
    description:
      "The Splotch visual language — tokens, components, and voice — rendered live from the app's own sources.",
  },
} as const;

export const SHARE_IMAGE_URL = `${SITE_ORIGIN}/large-image.png`;
// The size gen-promotional-image.mjs emits; tests/page.spec.ts reads the PNG
// header and fails when these drift from it.
const SHARE_IMAGE_WIDTH_PX = 1920;
const SHARE_IMAGE_HEIGHT_PX = 1080;

export const SHARE_CARD_SIZE = { width: 1200, height: 630 } as const;

export const PAGE_SHARE_CARDS = {
  '/privacy': { name: 'Privacy', file: 'privacy.png', alt: 'Splotch Privacy' },
  '/changelog': { name: 'Changelog', file: 'changelog.png', alt: 'Splotch Changelog' },
  '/feedback': { name: 'Feedback', file: 'feedback.png', alt: 'Splotch Feedback' },
  '/beta': { name: 'Beta', file: 'beta.png', alt: 'Splotch Beta' },
} as const;

export type PageShareCardPath = keyof typeof PAGE_SHARE_CARDS;

export function isPageShareCardPath(path: unknown): path is PageShareCardPath {
  return typeof path === 'string' && Object.hasOwn(PAGE_SHARE_CARDS, path);
}

export function shareImageFor(path: `/${string}`) {
  if (isPageShareCardPath(path)) {
    const card = PAGE_SHARE_CARDS[path];
    return {
      url: `${SITE_ORIGIN}/share/${card.file}?v=${shareCards[card.file]}`,
      ...SHARE_CARD_SIZE,
      alt: card.alt,
    };
  }
  return {
    url: SHARE_IMAGE_URL,
    width: SHARE_IMAGE_WIDTH_PX,
    height: SHARE_IMAGE_HEIGHT_PX,
    alt: 'Splotch, a drawing app for kids',
  };
}

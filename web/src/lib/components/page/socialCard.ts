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

export const SHARE_IMAGE_URL = `${SITE_ORIGIN}/large-image.png`;
// The size gen-promotional-image.mjs emits; tests/page.spec.ts reads the PNG
// header and fails when these drift from it.
const SHARE_IMAGE_WIDTH_PX = 1920;
const SHARE_IMAGE_HEIGHT_PX = 1080;

export const SHARE_CARD_SIZE = { width: 1200, height: 630 } as const;
export const SHARE_CARD_PATH_PARAM = 'path';

export const PAGE_SHARE_CARDS = {
  '/privacy': { name: 'Privacy', file: 'privacy.png', alt: 'Splotch Privacy' },
  '/changelog': { name: 'Changelog', file: 'changelog.png', alt: 'Splotch Changelog' },
  '/feedback': { name: 'Feedback', file: 'feedback.png', alt: 'Splotch Feedback' },
  '/beta': { name: 'Beta', file: 'beta.png', alt: 'Splotch Beta' },
} as const;

export type PageShareCardPath = keyof typeof PAGE_SHARE_CARDS;
export type PageShareCard = (typeof PAGE_SHARE_CARDS)[PageShareCardPath] & typeof SHARE_CARD_SIZE;

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

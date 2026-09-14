import { SITE_ORIGIN } from '$lib/siteUrl';

// The home page's link-preview card, which SocialCard.svelte renders when a
// route passes nothing. It mirrors the <title> and description in app.html,
// the one template that cannot import this module; siteUrl.test.ts holds the
// two together.
export const HOME_CARD = {
  path: '/',
  title: 'Splotch - Drawing for Kids',
  description: 'A simple drawing app for toddlers',
} as const;

export const SHARE_IMAGE_URL = `${SITE_ORIGIN}/large-image.png`;
// The size gen-promotional-image.mjs emits; tests/page.spec.ts reads the PNG
// header and fails when these drift from it.
export const SHARE_IMAGE_WIDTH_PX = 1920;
export const SHARE_IMAGE_HEIGHT_PX = 1080;

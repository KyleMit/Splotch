// The web-only half of the static export, and the head tags that reference it.
//
// `adapter-static` copies all of `static/` into the native bundle, but a
// Capacitor WebView can never request most of it: the social-card image is
// referenced by absolute `https://splotch.art` URL, the favicons + webmanifest
// exist for a browser tab and the PWA install prompt (both web-only services —
// see lib/boot/webOnlyServices.ts), `robots.txt`/`sitemap.xml` are for crawlers,
// and `deny.html` is the target of netlify.toml's edge deny-rules. Two files are
// generator INPUT that was never meant to ship at all (`large-image.svg` feeds
// gen-large-image.mjs, `styles/source.svg` feeds gen-style-covers.mjs), and two
// are authoring docs that ride along because they sit under `static/`.
//
// Paths are build-relative (the same shape as the coloring-catalog paths, minus
// the leading slash) so the strip and the tag rewrite agree by construction.
export const WEB_ONLY_STATIC_FILES = [
  'large-image.png',
  'large-image.svg',
  'favicon.ico',
  'favicon-96x96.png',
  'apple-touch-icon.png',
  'site.webmanifest',
  'web-app-manifest-192x192.png',
  'web-app-manifest-512x512.png',
  'robots.txt',
  'sitemap.xml',
  'deny.html',
  'ICONS-README.md',
  'styles/source.svg',
  'coloring/COLORING-BOOK.md',
];

// `<link>`/`<meta>` are void elements, so a non-greedy attribute scan is enough
// to isolate one whole tag — no nesting to get wrong. Trailing whitespace goes
// with the tag so removing one doesn't leave a blank line behind.
const VOID_HEAD_TAG = /<(?:link|meta)\b[^>]*>[ \t]*\n?/gi;

// Open Graph / Twitter card metadata describes the page to a crawler or a chat
// unfurler. Nothing can crawl a WebView, and the whole block goes together —
// `og:image:width` names no file, so the file-driven rule below would strip the
// image tag and orphan its dimensions.
const SOCIAL_CARD_TAG = /(?:property|name)="(?:og|twitter):/i;

/**
 * Drop every `<link>`/`<meta>` in `html` that the native build can't use: one
 * that references a stripped file, or social-card metadata.
 *
 * The file list drives the first rule, so a stripped file can never leave a tag
 * pointing at a 404. Matching is on the basename, which also catches absolute
 * URLs (`https://splotch.art/large-image.png`).
 */
export function stripWebOnlyHeadTags(html, files = WEB_ONLY_STATIC_FILES) {
  const basenames = files.map((file) => file.slice(file.lastIndexOf('/') + 1));
  const isWebOnly = (tag) =>
    SOCIAL_CARD_TAG.test(tag) || basenames.some((basename) => tag.includes(basename));
  return html.replace(VOID_HEAD_TAG, (tag) => (isWebOnly(tag) ? '' : tag));
}

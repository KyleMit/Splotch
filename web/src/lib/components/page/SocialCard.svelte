<script lang="ts">
  import { SITE_ORIGIN } from '$lib/siteUrl';

  // The link-preview card a route shows when its URL is pasted into a chat or
  // a social post. One component rather than a tag block per route, so every
  // card takes its origin and image from the same place. It cannot live in
  // app.html: the template cannot import SITE_ORIGIN, and a template card
  // would precede a route's in the head and win, because scrapers keep the
  // first tag they meet. The native build strips every og:/twitter: tag from
  // the prerendered pages (tools/mobile/lib/static-export.mjs), so no route
  // has to branch.
  //
  // The defaults are the home page's card, which mirrors the <title> and
  // description the template carries; siteUrl.test.ts holds the two together.
  // The props type is all-or-nothing so a route cannot override the path and
  // silently inherit the home page's words.
  interface Card {
    /** The route's own path; the card links to it on the canonical origin. */
    path: `/${string}`;
    title: string;
    description: string;
  }
  type Props = Card | { [K in keyof Card]?: undefined };

  let {
    path = '/',
    title = 'Splotch - Drawing for Kids',
    description = 'A simple drawing app for toddlers',
  }: Props = $props();

  const url = $derived(`${SITE_ORIGIN}${path}`);

  const SHARE_IMAGE_URL = `${SITE_ORIGIN}/large-image.png`;
  // The size gen-promotional-image.mjs emits; tests/page.spec.ts reads the
  // PNG header and fails when these drift from it.
  const SHARE_IMAGE_WIDTH_PX = 1920;
  const SHARE_IMAGE_HEIGHT_PX = 1080;
</script>

<svelte:head>
  <meta property="og:type" content="website" />
  <meta property="og:url" content={url} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:image" content={SHARE_IMAGE_URL} />
  <meta property="og:image:width" content={String(SHARE_IMAGE_WIDTH_PX)} />
  <meta property="og:image:height" content={String(SHARE_IMAGE_HEIGHT_PX)} />
  <meta property="og:site_name" content="Splotch" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content={url} />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={SHARE_IMAGE_URL} />
</svelte:head>

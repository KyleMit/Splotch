<script lang="ts">
  import { SITE_ORIGIN } from '$lib/siteUrl';
  import {
    HOME_CARD,
    SHARE_IMAGE_HEIGHT_PX,
    SHARE_IMAGE_URL,
    SHARE_IMAGE_WIDTH_PX,
  } from './socialCard';

  // The link-preview card a route shows when its URL is pasted into a chat or
  // a social post. One component rather than a tag block per route, so every
  // card takes its origin and image from the same place. It cannot live in
  // app.html: the template cannot import SITE_ORIGIN, and a template card
  // would precede a route's in the head and win, because scrapers keep the
  // first tag they meet. Nothing scrapes a WebView, so the whole card is
  // compiled out of the native build behind the build-time constant: the
  // native bundle carries no card before or after hydration, and
  // tools/mobile/check-static-bundle.mjs fails the build:cap export if one
  // comes back. The stripper in tools/mobile/lib/static-export.mjs is the
  // second layer for the prerendered HTML.
  //
  // The defaults are the home page's card (socialCard.ts). The props type is
  // all-or-nothing so a route cannot override the path and silently inherit
  // the home page's words.
  interface Card {
    /** The route's own path; the card links to it on the canonical origin. */
    path: `/${string}`;
    title: string;
    description: string;
  }
  type Props = Card | { [K in keyof Card]?: undefined };

  let {
    path = HOME_CARD.path,
    title = HOME_CARD.title,
    description = HOME_CARD.description,
  }: Props = $props();

  const url = $derived(`${SITE_ORIGIN}${path}`);
</script>

<svelte:head>
  {#if !__IS_CAPACITOR__}
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
  {/if}
</svelte:head>

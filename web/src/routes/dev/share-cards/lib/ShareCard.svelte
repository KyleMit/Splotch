<script lang="ts">
  import paperTexture from '$lib/assets/handmade-paper.webp';
  import CrayonStrip from '$lib/components/CrayonStrip.svelte';
  import SplotchyIcon from '$lib/components/SplotchyIcon.svelte';
  // Server load supplies the data: a runtime metadata import here adds a startup
  // chunk to the home page, enforced by tools/check-bundle-budgets.mjs.
  import type { PageShareCard } from '$lib/components/page/socialCard';
  import { themes, scale } from '$lib/design/tokens';
  import { paletteHex } from '$lib/palette';

  let { card }: { card: PageShareCard } = $props();

  const BAND_HEIGHT_PX = 30;
  const BAND_GAP_PX = 4;
  const BAND_SEGMENTS = 7;
  const CONTENT_GUTTER_PX = 75;
  const CONTENT_TOP_GAP_PX = 52;
  const CONTENT_BOTTOM_PX = 60;
  const MARK_SIZE_PX = 104;
  const BRAND_GAP_PX = 24;
  const WORDMARK_FONT_PX = 44;
  const TITLE_FONT_PX = 120;
  const HIGHLIGHT_HEIGHT_PX = 44;
  const HIGHLIGHT_BOTTOM_PX = 14;
  const HIGHLIGHT_LEFT_PX = 14;
  const HIGHLIGHT_RIGHT_PX = 28;
</script>

<article
  class="share-card"
  aria-label={card.alt}
  style="width:{card.width}px;height:{card.height}px;--card-paper:{themes.light
    .paper};--card-text:{themes.light.text};--card-strong:{themes.light
    .textStrong};--card-font:{scale.fontFamily};--card-yellow:{paletteHex(
    'Yellow'
  )};--card-gutter:{CONTENT_GUTTER_PX}px;--card-top:{BAND_HEIGHT_PX +
    CONTENT_TOP_GAP_PX}px;--card-bottom:{CONTENT_BOTTOM_PX}px;--card-mark:{MARK_SIZE_PX}px;--card-brand-gap:{BRAND_GAP_PX}px;--card-wordmark-font:{WORDMARK_FONT_PX}px;--card-title-font:{TITLE_FONT_PX}px;--card-highlight-height:{HIGHLIGHT_HEIGHT_PX}px;--card-highlight-bottom:{HIGHLIGHT_BOTTOM_PX}px;--card-highlight-left:-{HIGHLIGHT_LEFT_PX}px;--card-highlight-right:-{HIGHLIGHT_RIGHT_PX}px"
>
  <div class="paper" style="background-image:url('{paperTexture}')"></div>
  <div
    class="band"
    style="--crayon-width:{(card.width - (BAND_SEGMENTS - 1) * BAND_GAP_PX) /
      BAND_SEGMENTS}px;--crayon-height:{BAND_HEIGHT_PX}px;--crayon-gap:{BAND_GAP_PX}px"
  >
    <CrayonStrip />
  </div>
  <div class="content">
    <div class="brand">
      <SplotchyIcon style="width:var(--card-mark);height:var(--card-mark)" /><span>SPLOTCH</span>
    </div>
    <h1><span>{card.name}</span></h1>
  </div>
</article>

<style>
  .share-card {
    position: absolute;
    top: 0;
    left: 0;
    overflow: hidden;
    background: var(--card-paper);
    color: var(--card-strong);
    font-family: var(--card-font);
  }

  .paper {
    position: absolute;
    inset: 0;
    background-repeat: repeat;
  }

  .band {
    position: relative;
    line-height: 0;
  }

  .content {
    position: absolute;
    inset: var(--card-top) var(--card-gutter) var(--card-bottom);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: var(--card-brand-gap);
    color: var(--card-text);
    font-size: var(--card-wordmark-font);
    font-weight: 700;
    letter-spacing: 0.14em;
  }

  h1 {
    margin: 0;
    font-size: var(--card-title-font);
    font-weight: 700;
    line-height: 1.05;
    letter-spacing: -0.015em;
    text-wrap: balance;
  }

  h1 span {
    position: relative;
    isolation: isolate;
  }

  h1 span::before {
    content: '';
    position: absolute;
    z-index: -1;
    left: var(--card-highlight-left);
    right: var(--card-highlight-right);
    bottom: var(--card-highlight-bottom);
    height: var(--card-highlight-height);
    border-radius: 999px;
    background: var(--card-yellow);
    opacity: 0.7;
    transform: rotate(-1.5deg);
  }
</style>

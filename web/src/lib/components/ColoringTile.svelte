<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import type { BookOrientation, ResponsiveColoringImage } from '$lib/state/books';

  interface TileBase extends HTMLButtonAttributes {
    image: ResponsiveColoringImage;
    sizes: string;
    hoverArmed: boolean;
    retiring: boolean;
  }

  type Props = TileBase &
    ({ shape: 'cover'; label: string } | { shape: BookOrientation; label?: never });

  let { image, sizes, shape, label, hoverArmed, retiring, ...rest }: Props = $props();
</script>

<button
  {...rest}
  class="coloring-tile"
  class:coloring-book-tile={shape === 'cover'}
  class:page-landscape={shape === 'landscape'}
  class:page-portrait={shape === 'portrait'}
  class:hover-armed={hoverArmed}
  class:retiring
  type="button"
>
  <img
    src={image.src}
    srcset={__IS_CAPACITOR__ ? undefined : image.srcset}
    sizes={__IS_CAPACITOR__ ? undefined : sizes}
    alt=""
    loading="lazy"
  />
  {#if label}
    <span class="coloring-book-label">{label}</span>
  {/if}
</button>

<style>
  /* Tiles are little paper cards that preview each page/cover's line art, and
     they follow the theme so the preview matches the applied page (ADR-0052):
     a light card with black lines in light mode, a dark card with white "chalk"
     lines in dark mode (via the --lineart-* tokens on the img below). */
  .coloring-tile {
    position: relative;
    background: var(--surface-2);
    /* The tile is the tap target, so its edge has to read as a card and not
       as the art's bounding box: the strong warm border clears 1.9:1 on the
       dialog where --border managed 1.3:1, and the float lift says "press". */
    border: 2px solid var(--border-warm-strong);
    border-radius: var(--radius-md);
    box-shadow: var(--float-shadow);
    cursor: pointer;
    overflow: hidden;
    padding: 0;
    aspect-ratio: 1 / 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    transition:
      background-color var(--duration-fast) ease,
      border-color var(--duration-fast) ease,
      box-shadow var(--duration-fast) ease,
      transform var(--duration-fast) ease;
    touch-action: manipulation;
  }

  @media (hover: hover) {
    .coloring-tile.hover-armed:hover {
      border-color: var(--brand);
      background: var(--brand-wash);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px color-mix(in srgb, var(--brand) 25%, transparent);
    }
  }

  .coloring-tile:active,
  .coloring-tile:global(.activation-pending) {
    transform: scale(0.96);
  }

  .coloring-tile.retiring {
    transition: none;
  }

  .coloring-tile img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    padding: var(--space-2);
    pointer-events: none;
  }

  /* The bottom band reserves the overlaid .coloring-book-label's box, and the
     label fills exactly that band: snapping the reserve down risks the caption
     covering the art, snapping it up opens a gap. Functional, not scale drift. */
  .coloring-book-tile {
    --cover-caption-height: 28px;
  }

  .coloring-book-tile img {
    padding: var(--space-2) var(--space-2) var(--cover-caption-height) var(--space-2);
    mix-blend-mode: var(--lineart-blend);
    filter: var(--lineart-filter);
  }

  .coloring-tile.page-landscape {
    aspect-ratio: 3 / 2;
  }

  .coloring-tile.page-portrait {
    aspect-ratio: 2 / 3;
  }

  .coloring-book-label {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: var(--cover-caption-height);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 var(--space-2);
    /* rgb fallback precedes the color-mix (docs/COMPATIBILITY.md); both follow
       the theme so the caption sits on the tile's own paper tone. */
    background: rgb(255 255 255 / 92%);
    background: color-mix(in srgb, var(--surface-2) 92%, transparent);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--text);
    text-align: center;
  }
</style>

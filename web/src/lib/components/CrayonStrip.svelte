<script lang="ts">
  import { paletteHex } from '$lib/palette';

  // The brand crayon strip, matching the scrapbook pages' masthead
  // (scripts/lib/scrapbook-chrome.mjs). Decorative — it carries no information
  // the surrounding copy doesn't, so it stays out of the accessibility tree.
  //
  // Rainbow order, which is not palette.ts's order: that list is sequenced by
  // the drawing palette's own trim priority (purple first, bonus swatches
  // interleaved). Hues are looked up by label rather than copied as hexes so
  // the strip can't drift from the app's palette.
  const CRAYON_LABELS = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Pink'];
</script>

<span class="crayons" aria-hidden="true">
  {#each CRAYON_LABELS as label (label)}
    <i style="background:{paletteHex(label)}"></i>
  {/each}
</span>

<style>
  /* Chip size is a call-site decision — the strip reads as a brand mark at one
     size in a top bar and another in a masthead — so it comes in as custom
     properties. The defaults are the scrapbook masthead's. */
  .crayons {
    display: inline-flex;
    gap: var(--crayon-gap, 4px);
    flex: 0 0 auto;
  }

  .crayons i {
    display: block;
    width: var(--crayon-width, 22px);
    height: var(--crayon-height, 7px);
    border-radius: 999px;
  }
</style>

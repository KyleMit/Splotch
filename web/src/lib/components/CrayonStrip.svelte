<script lang="ts">
  import { PALETTE_COLORS } from '$lib/palette';

  // The brand crayon strip, matching the scrapbook pages' masthead
  // (scripts/lib/scrapbook-chrome.mjs). Decorative — it carries no information
  // the surrounding copy doesn't, so it stays out of the accessibility tree.
  //
  // Rainbow order, which is not palette.ts's order: that list is sequenced by
  // the drawing palette's own trim priority (purple first, bonus swatches
  // interleaved). The hues are looked up by label rather than copied as hexes
  // so the strip can't drift from the app's palette — palette-source.test.mjs
  // enforces that single source.
  const CRAYON_LABELS = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Pink'];

  const crayons = CRAYON_LABELS.map((label) => {
    const color = PALETTE_COLORS.find((entry) => entry.label === label);
    if (!color) throw new Error(`CrayonStrip: no palette color labelled "${label}"`);
    return color;
  });
</script>

<span class="crayons" aria-hidden="true">
  {#each crayons as crayon (crayon.label)}
    <i style="background:{crayon.hex}"></i>
  {/each}
</span>

<style>
  .crayons {
    display: inline-flex;
    gap: 4px;
    flex: 0 0 auto;
  }

  .crayons i {
    display: block;
    width: 22px;
    height: 7px;
    border-radius: 99px;
  }
</style>

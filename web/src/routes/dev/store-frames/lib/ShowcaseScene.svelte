<script lang="ts">
  import wandSvg from '$lib/icons/wand-stars.svg?raw';
  import { paletteHex } from '$lib/palette';
  import type { StoreTarget } from './targets.ts';
  import { L_BASE_H, P_BASE_W, type FrameGeometry } from './geometry.ts';
  import { MARKS } from './marks.ts';
  import { P_SHOWCASE_DESIGN_H, SHOWCASE_CARD_SPEC, SHOWCASE_SPEC } from './showcase.ts';
  import { AI_AFTER_ASSET_FILE, AI_BEFORE_ASSET_FILE, assetUrl } from './paths.ts';

  interface Props {
    target: StoreTarget;
    geo: FrameGeometry;
  }

  let { target, geo }: Props = $props();

  const k = $derived(geo.k);
  const spec = $derived(SHOWCASE_SPEC[geo.orientation]);
  const card = $derived(SHOWCASE_CARD_SPEC[geo.orientation]);
  const v = $derived(
    geo.orientation === 'portrait' ? Math.min(1, target.height / k / P_SHOWCASE_DESIGN_H) : 1
  );
  // Landscape is authored at 16:9; on the taller 4:3 iPad the width-scaled
  // composition would sit top-heavy, so it re-centers in the extra height —
  // the same reasoning as the landscape marks' height-scaled Y.
  const yOffset = $derived(
    geo.orientation === 'landscape' ? Math.round((target.height - L_BASE_H * k) / 2) : 0
  );

  const sx = (x: number) => Math.round(k * (x * v + (P_BASE_W / 2) * (1 - v)));
  const sy = (y: number) => Math.round(y * v * k) + yOffset;
  const sw = (w: number) => Math.round(w * v * k);
  const px = (value: number) => `${Math.round(value * k)}px`;

  const cardVars = $derived(
    [
      `--doodle-radius:${px(card.doodleRadius)}`,
      `--polaroid-radius:${px(card.polaroidRadius)}`,
      `--polaroid-pad:${px(card.pad)}`,
      `--polaroid-img-radius:${px(4)}`,
      `--caption-size:${px(card.caption)}`,
      `--caption-pad-top:${px(card.captionPad[0])}`,
      `--caption-pad-bottom:${px(card.captionPad[1])}`,
    ].join(';')
  );

  const place = (p: { x: number; y: number; w: number }) =>
    `left:${sx(p.x)}px;top:${sy(p.y)}px;width:${sw(p.w)}px`;
</script>

<!-- No z-index on the wrapper: its positioned children keep their own levels
     (stones/sparkles 1, cards 3, wand 4) in the page's stacking context, the
     same flat order the composed HTML used. -->
<div class="showcase" style={cardVars}>
  <img class="doodle" style={place(spec.doodle)} src={assetUrl(AI_BEFORE_ASSET_FILE)} alt="" />
  {#each spec.stones as stone (stone)}
    <span
      class="mark"
      style="left:{sx(stone.x)}px;top:{sy(stone.y)}px;width:{sw(stone.d)}px;height:{sw(
        stone.d
      )}px;border-radius:50%;background:{paletteHex(stone.color)}"
    ></span>
  {/each}
  <!-- eslint-disable svelte/no-at-html-tags wand and sparkle SVGs are first-party strings from lib/icons and marks.ts -->
  <div class="wand" style={place(spec.wand)}>{@html wandSvg}</div>
  {#each spec.sparkles as sparkle (sparkle)}
    <span class="mark" style={place(sparkle)}>{@html MARKS.sparkle(paletteHex(sparkle.color))}</span
    >
  {/each}
  <!-- eslint-enable svelte/no-at-html-tags -->
  <div class="polaroid" style={place(spec.polaroid)}>
    <img src={assetUrl(AI_AFTER_ASSET_FILE)} alt="" />
    <div class="polaroid-caption">AI-generated picture</div>
  </div>
</div>

<style>
  .showcase {
    position: absolute;
    inset: 0;
  }

  .mark {
    position: absolute;
    z-index: 1;
    display: block;
  }

  .mark :global(svg) {
    display: block;
    width: 100%;
    height: auto;
  }

  .doodle {
    position: absolute;
    z-index: 3;
    transform: rotate(-2deg);
    border-radius: var(--doodle-radius);
    box-shadow: var(--frame-shadow);
  }

  .wand {
    position: absolute;
    z-index: 4;
  }

  .wand :global(svg) {
    display: block;
    width: 100%;
    height: auto;
  }

  /* The polaroid is the app's own polaroid object, so its paper and caption
     ink come straight from the canonical tokens (tokens.css, loaded by the
     root layout) rather than frame-local values. */
  .polaroid {
    position: absolute;
    z-index: 3;
    transform: rotate(3deg);
    background: var(--polaroid-paper);
    padding: var(--polaroid-pad) var(--polaroid-pad) 0;
    border-radius: var(--polaroid-radius);
    box-shadow: var(--frame-shadow);
  }

  .polaroid img {
    display: block;
    width: 100%;
    border-radius: var(--polaroid-img-radius);
  }

  .polaroid-caption {
    text-align: center;
    font-size: var(--caption-size);
    font-weight: 600;
    color: var(--polaroid-ink);
    padding: var(--caption-pad-top) 0 var(--caption-pad-bottom);
  }
</style>

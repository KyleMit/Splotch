<script lang="ts">
  import AiConfetti from './AiConfetti.svelte';
  import AiDial from './AiDial.svelte';
  import { DIAL_MAX_SIZE_PX, DIAL_STAGE_FRACTION } from './aiDialGeometry';
  import { aiResult } from '$lib/state/aiGeneration.svelte';
  import { aiProgress } from '$lib/state/aiProgress.svelte';
  import { pinchZoom } from '$lib/actions/pinchZoom.svelte';

  interface Props {
    // The card's send-off animation, which the pinch has to stand down for.
    exiting: boolean;
    // The picture's own ratio, which the card sizes itself from.
    onaspect: (aspect: number) => void;
  }

  let { exiting, onaspect }: Props = $props();

  let stageEl = $state<HTMLDivElement | undefined>();
  let zoomLayerEl = $state<HTMLDivElement | undefined>();
  // A URL exists before its image has intrinsic dimensions. Keep the fallback
  // geometry until this exact resource has decoded, including on the result swap.
  let loadedSizerSrc = $state<string | null>(null);

  const revealed = $derived(aiProgress.revealed);
  const sizerSrc = $derived(aiResult.resultUrl || aiResult.previewUrl);

  const MIN_BLUR_PX = 2;
  const MAX_EXTRA_BLUR_PX = 16;

  // Tracks the stage's rendered size, which AiConfetti needs in real pixels: the
  // fall distance (--stage-h) spans the stage rather than a fixed guess, and the
  // mask hole (below) is a circle the stage's own aspect can't express in
  // percentages. Both vary by viewport, by the autosave variant, and by the
  // picture's shape. Reactive on stageEl (not onMount): the card unmounts this
  // whole component for the error state and mounts a fresh one on retry, so the
  // observer must follow the element rather than bind once at mount.
  let stageHeight = $state(0);
  let stageWidth = $state(0);
  $effect(() => {
    if (!stageEl) {
      stageHeight = 0;
      stageWidth = 0;
      return;
    }
    const el = stageEl;
    const ro = new ResizeObserver(([entry]) => {
      stageHeight = entry.contentRect.height;
      stageWidth = entry.contentRect.width;
    });
    ro.observe(el);
    return () => ro.disconnect();
  });

  function handleImgLoad(e: Event) {
    if (!(e.currentTarget instanceof HTMLImageElement)) return;
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
    if (w > 0 && h > 0) {
      loadedSizerSrc = sizerSrc;
      onaspect(w / h);
    }
  }

  // The drawing stays blurry to keep the suspense, sharpening as we progress.
  const previewBlur = $derived(`${MIN_BLUR_PX + MAX_EXTRA_BLUR_PX * (1 - aiProgress.value)}px`);

  // Keep the confetti's mask hole on the round dial, which means matching the
  // dial's own two-part size: a fraction of the stage until it stops at its cap.
  // The clearance opens the hole a little wider than the dial, so leaves vanish
  // just behind its translucent rim rather than at the exact edge.
  //
  // The result is a circle, and a circle on a stage of any aspect needs the same
  // radius in both axes — which the measured stage width gives directly. Handing
  // AiConfetti one radius in real pixels for --confetti-rx/--confetti-ry beats
  // deriving the vertical one from the picture's aspect, and it keeps the value
  // out of the gradient as CSS math, which is not worth relying on there.
  const MASK_CLEARANCE = 1.19;
  const maskRadiusPx = $derived(
    Math.min(stageWidth * (DIAL_STAGE_FRACTION / 2), DIAL_MAX_SIZE_PX / 2) * MASK_CLEARANCE
  );

  const stageStyle = $derived(
    (maskRadiusPx > 0
      ? `--confetti-rx: ${maskRadiusPx.toFixed(1)}px; --confetti-ry: ${maskRadiusPx.toFixed(1)}px;`
      : '') + (stageHeight > 0 ? ` --stage-h: ${stageHeight}px;` : '')
  );
</script>

<div
  class="ai-stage"
  bind:this={stageEl}
  style={stageStyle}
  use:pinchZoom={() => ({
    target: zoomLayerEl!,
    // Only once the finished picture is on screen — the loading dial and
    // blurred preview shouldn't zoom.
    enabled: revealed && !!aiResult.resultUrl && !exiting,
    // A fresh result resets the zoom back to fit.
    resetKey: aiResult.resultUrl,
  })}
>
  <!-- The zoom layer holds only the picture; the dial and confetti stay
       outside it so they never scale with a pinch. -->
  <div class="zoom-layer" bind:this={zoomLayerEl}>
    <!-- Hidden in-flow sizer: a real <img> drives the stage size from the
         image's own dimensions (capped by max-width/max-height). Replaced
         elements size identically in every browser — unlike an
         aspect-ratio + max-width box, which WebKit collapses/distorts. The
         visible images below overlay it. Uses the result once it's here, or
         the preview while loading (same aspect, so no resize on reveal). -->
    {#if sizerSrc}
      <img
        class="stage-sizer"
        class:loaded={loadedSizerSrc === sizerSrc}
        src={sizerSrc}
        alt=""
        aria-hidden="true"
        onload={handleImgLoad}
      />
    {:else}
      <!-- Modal opened ahead of the export: reserve a drawing-shaped box so
           the dial has a home until the blurred preview slots in. -->
      <div class="stage-sizer placeholder-sizer" aria-hidden="true"></div>
    {/if}

    {#if aiResult.previewUrl}
      <img
        class="stage-img preview"
        class:gone={revealed}
        style="filter: blur({previewBlur}) saturate(1.1);"
        src={aiResult.previewUrl}
        alt=""
      />
    {/if}

    {#if aiResult.resultUrl}
      <img class="stage-img result" class:shown={revealed} src={aiResult.resultUrl} alt="" />
    {/if}
  </div>

  {#if !revealed}
    <AiConfetti />
    <AiDial />
  {/if}
</div>

<style>
  /* Holds the blurred drawing, the dial, and the final image. Its own size comes
     from .stage-sizer below, within the budget the card hands down as
     --result-stage-max-h/-w (AiImageResult). */
  .ai-stage {
    --result-entry-blur: 2px;
    position: relative;
    display: block;
    line-height: 0; /* drop the inline-image baseline gap under the sizer */
    border-radius: var(--radius-md);
    overflow: hidden;
    background: #fcfbf8;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    /* Own the touch gesture so the scoped pinch-zoom (use:pinchZoom) drives the
       preview instead of the browser — the drawing surface stays zoom-locked
       (ADR-0076). */
    touch-action: none;
  }

  /* The pinch target: a top-left-anchored layer holding just the picture. The
     surrounding .ai-stage stays at scale 1 so its rect is a stable reference,
     and its overflow:hidden clips the zoomed image to the preview's own bounds. */
  .zoom-layer {
    position: relative;
    display: block;
    transform-origin: 0 0;
    will-change: transform;
  }
  /* `.zoomed` is toggled imperatively by the pinchZoom action (via classList). */
  .ai-stage:global(.zoomed) {
    cursor: grab;
  }

  /* The invisible sizer: fits the image's natural aspect within the max width
     and the available viewport height, sizing to whichever binds. It occupies
     layout (so the stage takes its size) but isn't painted — the .stage-img
     overlays show the actual picture. */
  .stage-sizer {
    display: block;
    visibility: hidden;
    width: auto;
    height: auto;
    /* Width is capped to the content box, which the card sized from this same
       height budget and the image's aspect — so for a picture that fits the
       viewport both bind at once and none of the card is empty. A picture too
       tall to project that way is held by the height alone and sits centered. */
    max-width: 100%;
    max-height: var(--result-stage-max-h);
    /* The budget it sizes against changes once at the reveal, when the
       keep-drawing pill leaves and gives its room back to the picture. Gliding
       through that means the picture opens up as it lands instead of the
       blurred preview stretching in the single frame the card swaps states. */
    transition: max-height var(--duration-slow) var(--ease-glide);
  }

  @media (prefers-reduced-motion: reduce) {
    .stage-sizer {
      transition: none;
    }
  }

  /* Before the URL exists — and while its image is still decoding — use a box
     in the drawing's shape and at the size the preview will take, so the dial
     has a stable home and the card doesn't resize under it when the preview
     slots in. Its width is spelled out rather than taken as a percentage of the
     stage: the stage shrink-wraps this box, so a percentage would be resolving
     against the width it is itself supposed to determine, and collapses. */
  .placeholder-sizer,
  .stage-sizer:not(.loaded) {
    width: min(var(--result-stage-max-w), calc(var(--result-stage-max-h) * var(--result-aspect)));
    aspect-ratio: var(--result-aspect);
  }

  .stage-img {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .preview {
    transition:
      opacity 0.5s ease,
      filter var(--duration-base) linear;
    transform: scale(1.04); /* hide blur bleed at edges */
  }

  .preview.gone {
    opacity: 0;
  }

  .result {
    opacity: 0;
    transform: scale(1.08);
    filter: blur(var(--result-entry-blur));
    transition:
      opacity 0.55s ease,
      transform 0.6s var(--ease-glide),
      filter var(--duration-slow) var(--ease-glide);
  }

  .result.shown {
    opacity: 1;
    transform: scale(1);
    filter: blur(0);
  }
</style>

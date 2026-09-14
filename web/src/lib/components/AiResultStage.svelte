<script lang="ts">
  import AiConfetti from './AiConfetti.svelte';
  import AiDial from './AiDial.svelte';
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

  let zoomLayerEl = $state<HTMLDivElement | undefined>();
  // A URL exists before its image has intrinsic dimensions. Keep the fallback
  // geometry until this exact resource has decoded, including on the result swap.
  let loadedSizerSrc = $state<string | null>(null);
  // The decoded picture's own width. The sizer never draws it larger than
  // this, so the stage's declared box (style block) is capped by it — read once
  // off the load event, beside the aspect, never off a layout measurement.
  let naturalWidthPx = $state(0);

  const revealed = $derived(aiProgress.revealed);
  const sizerSrc = $derived(aiResult.resultUrl || aiResult.previewUrl);
  const decodedNaturalWidth = $derived(loadedSizerSrc === sizerSrc ? naturalWidthPx : 0);

  const MIN_BLUR_PX = 2;
  const MAX_EXTRA_BLUR_PX = 16;
  // Quantized like the waiting polaroid's fill percent next door, and for the
  // same reason: the blur ramps 18px to 2px across a run of about half a minute,
  // so a raw per-frame value rewrites this image's filter sixty times a second —
  // over the canvas the child is still drawing on (ADR-0116) — to move it by
  // under a hundredth of a pixel. A quarter-pixel step is indistinguishable at
  // an 18px blur and is the knob if that ever stops being true.
  const BLUR_STEP_PX = 0.25;

  function handleImgLoad(e: Event) {
    if (!(e.currentTarget instanceof HTMLImageElement)) return;
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
    if (w > 0 && h > 0) {
      loadedSizerSrc = sizerSrc;
      naturalWidthPx = w;
      onaspect(w / h);
    }
  }

  // The drawing stays blurry to keep the suspense, sharpening as we progress.
  const previewBlur = $derived(
    `${Math.round((MIN_BLUR_PX + MAX_EXTRA_BLUR_PX * (1 - aiProgress.value)) / BLUR_STEP_PX) * BLUR_STEP_PX}px`
  );
</script>

<div
  class="ai-stage"
  style="--result-entry-blur: {MIN_BLUR_PX}px;"
  style:--stage-natural-w={decodedNaturalWidth > 0 ? `${decodedNaturalWidth}px` : undefined}
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
  /* Registered so it can transition: an unregistered custom property changes
     in one step. Inherited like every other stage variable. */
  @property --stage-budget-h {
    syntax: '<length>';
    inherits: true;
    initial-value: 0;
  }

  /* Holds the blurred drawing, the dial, and the final image. Its own size comes
     from .stage-sizer below, within the budget the card hands down as
     --result-stage-max-h/-w (AiImageResult). */
  .ai-stage {
    /* The stage's box, declared from the card's budget, the picture's aspect,
       and the decoded picture's own width: the same terms .stage-sizer below
       is drawn from, so this is what the stage renders at in every state — the
       placeholder before a URL exists, the placeholder box again while a fresh
       URL decodes (no natural width is published for it yet), and the picture
       itself once it has, capped by its natural width the way the sizer never
       upscales past it. AiConfetti spends these: the fall distance spans
       --stage-h, and the mask hole is cut around the dial, which is
       DIAL_STAGE_FRACTION of the stage until DIAL_MAX_SIZE_PX, opened by
       MASK_CLEARANCE so leaves vanish behind its translucent rim rather than at
       the exact edge (aiDialGeometry.ts; AiResultStage.geometry.test.ts holds
       these literals to it). Declared rather than measured, so the hole and the
       fall are right in the frame the stage first paints, follow the aspect
       swap, a rotation and the autosave footer through the cascade, and never
       rewrite this element's style from a resize while a generation runs over
       the live canvas (ADR-0116). A circle needs the same radius on both axes,
       which the width-derived radius gives on a stage of any aspect.

       The height budget is the one term the sizer does not take instantly: its
       max-height glides through the budget change at the reveal, so the box
       is derived from --stage-budget-h, a registered length that glides on the
       same tokens (the @property below), and the aspect swap and the natural
       cap stay instant on both. */
    --stage-budget-h: var(--result-stage-max-h);
    --stage-w: min(
      var(--result-stage-max-w),
      calc(var(--stage-budget-h) * var(--result-aspect)),
      var(--stage-natural-w, var(--result-stage-max-w))
    );
    --stage-h: calc(var(--stage-w) / var(--result-aspect));
    --confetti-mask-radius: calc(min(var(--stage-w) * 0.26, 150px) * 1.19);
    --confetti-rx: var(--confetti-mask-radius);
    --confetti-ry: var(--confetti-mask-radius);

    transition: --stage-budget-h var(--duration-slow) var(--ease-glide);
    position: relative;
    display: block;
    line-height: 0; /* drop the inline-image baseline gap under the sizer */
    border-radius: var(--radius-md);
    overflow: hidden;
    background: #fcfbf8;
    box-shadow: 0 4px 16px rgb(0 0 0 / 15%);
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
    /* The budget it sizes against changes at the reveal, when the keep-drawing
       pill leaves and gives its room back to the picture. A decoded image glides
       through that change so the picture opens up as it lands. An undecoded
       image follows the fallback box below directly: preserving its footprint
       takes precedence over animating a resource that has no pixels yet. */
    transition: max-height var(--duration-slow) var(--ease-glide);
  }

  @media (prefers-reduced-motion: reduce) {
    .ai-stage,
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

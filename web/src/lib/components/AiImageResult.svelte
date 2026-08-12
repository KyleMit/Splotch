<script lang="ts">
  import Icon from './Icon.svelte';
  import AiDial from './AiDial.svelte';
  import AiConfetti from './AiConfetti.svelte';
  import AiImageReport, { type ImageReportStatus } from './AiImageReport.svelte';
  import AiResultDisclosure from './AiResultDisclosure.svelte';
  import { aiResult, closeAiResult } from '$lib/state/aiGeneration.svelte';
  import { settings } from '$lib/state/settings.svelte';
  import { modalDialog } from '$lib/actions/modalDialog.svelte';
  import { pinchZoom } from '$lib/actions/pinchZoom.svelte';
  import { buttonCenter, type Origin } from '$lib/state/modal.svelte';
  import { requireParentalGate } from '$lib/state/parentalGate.svelte';
  import { AI_LOADING_SUBTITLE, AI_LOADING_TITLE } from '$lib/ai/loadingCopy';
  import {
    timestamp,
    triggerDownload,
    extensionForImageType,
    AI_IMAGE_BASENAME,
  } from '$lib/saveNaming';

  let dialogEl: HTMLDialogElement;
  let aiStageEl = $state<HTMLDivElement | undefined>();
  let zoomLayerEl = $state<HTMLDivElement | undefined>();

  // Tracks the stage's rendered height so AiConfetti's fall distance (--stage-h)
  // spans the real stage instead of a fixed pixel guess — the stage's height is
  // capped by .stage-sizer's viewport-relative max-height, which varies by
  // viewport and by the autosave variant. Reactive on aiStageEl (not onMount):
  // the error state's {:else} unmounts .ai-stage and swaps in a fresh element
  // on retry, so the observer must be re-attached each time the element
  // changes, not just once at component mount.
  let stageHeight = $state(0);
  $effect(() => {
    if (!aiStageEl) {
      stageHeight = 0;
      return;
    }
    const el = aiStageEl;
    const ro = new ResizeObserver(([entry]) => {
      stageHeight = entry.contentRect.height;
    });
    ro.observe(el);
    return () => ro.disconnect();
  });

  let revealed = $state(false);
  let progress = $state(0);
  const loading = $derived(aiResult.open && !revealed && !aiResult.error);
  let exiting = $state(false);
  let reportStatus = $state<ImageReportStatus>('idle');
  let reportOrigin = $state<Origin | null>(null);

  // The strip carries the button that launches the confirm dialog, so it stays
  // mounted for as long as that dialog is up: a <dialog> hands focus back to
  // whatever held it before showModal(), and a launcher that unmounted in the
  // meantime leaves that a detached node — dismissing would drop a keyboard
  // user on <body>, outside the result they were in. It gives way only once the
  // footer has a status message to carry the outcome instead.
  const reportSettled = $derived(reportStatus === 'success' || reportStatus === 'error');

  // The gate proves an adult is present; the confirmation that follows is the
  // last step before an irreversible send. Reversing the two would let a parent
  // solve the sum only to discover the report had already gone.
  function requestReport(event: MouseEvent & { currentTarget: HTMLElement }) {
    reportOrigin = buttonCenter(event.currentTarget);
    requireParentalGate('imageReport', () => (reportStatus = 'confirm'), reportOrigin);
  }

  const DEFAULT_ASPECT = 4 / 3;
  const MIN_BLUR_PX = 2;
  const MAX_EXTRA_BLUR_PX = 16;

  // Seed the stage with the window's aspect ratio as soon as generation starts
  // so the placeholder box closely matches the preview that slots in a beat later.
  let imgAspect = $state(DEFAULT_ASPECT);
  $effect(() => {
    if (aiResult.open && aiResult.generating) {
      if (window.innerHeight > 0) {
        imgAspect = window.innerWidth / window.innerHeight;
      }
    }
  });

  // Reset the dial's display state here in the parent — not in AiDial, which is
  // unmounted by `{#if !revealed}` the moment generation completes and so never
  // sees the modal close. Without this, `revealed` stays true and the spinner
  // never mounts on the next generation.
  $effect(() => {
    if (!aiResult.open) {
      exiting = false;
      revealed = false;
      progress = 0;
      reportStatus = 'idle';
    }
  });

  function handleImgLoad(e: Event) {
    if (!(e.currentTarget instanceof HTMLImageElement)) return;
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
    if (w > 0 && h > 0) imgAspect = w / h;
  }

  // The drawing stays blurry to keep the suspense, sharpening as we progress.
  const previewBlur = $derived(`${MIN_BLUR_PX + MAX_EXTRA_BLUR_PX * (1 - progress)}px`);

  // Keep the confetti's circular mask hole aligned with the round dial as the
  // stage aspect changes. The one load-bearing value is DIAL_MASK_RX (% of
  // width); the vertical radius (% of height) tracks it by the stage aspect.
  // Both are handed to AiConfetti via --confetti-rx/--confetti-ry on .ai-stage.
  // At 4:3 this resolves to the original 41%.
  const DIAL_MASK_RX = 31;
  const confettiMaskRy = $derived(`${(DIAL_MASK_RX * imgAspect).toFixed(1)}%`);

  const stageStyle = $derived(
    `--confetti-rx: ${DIAL_MASK_RX}%; --confetti-ry: ${confettiMaskRy};` +
      (stageHeight > 0 ? ` --stage-h: ${stageHeight}px;` : '')
  );

  function handleDownload() {
    if (!aiResult.resultUrl || exiting) return;
    triggerDownload(
      aiResult.resultUrl,
      `${AI_IMAGE_BASENAME}-${timestamp()}.${extensionForImageType(aiResult.resultType ?? '')}`
    );

    // Morph the modal into a polaroid, hold it in the center, then let it fly
    // off to the bottom-left. The fly-out animation's end dismisses the modal.
    exiting = true;
  }

  // Fires when the polaroid fly-out finishes. We match on target rather than
  // animation name because Svelte scopes local @keyframes names at build time
  // (e.g. "svelte-abc123-ai-polaroid-fly"), so an exact name check won't match.
  // The dialog's only own animation is the fly-out; child animations bubble up
  // but have a different target, so this stays specific to the send-off.
  function handleAnimationEnd(e: AnimationEvent) {
    if (exiting && e.target === dialogEl) {
      closeAiResult();
    }
  }
</script>

<dialog
  class="ai-result-modal modal-dialog modal-shell"
  class:polaroid-mode={exiting}
  class:autosave={settings.autoSaveAiEnabled}
  class:loading
  bind:this={dialogEl}
  use:modalDialog={() => ({
    open: aiResult.open,
    onRequestClose: closeAiResult,
    // While the image is still generating, neither a backdrop tap nor Esc may
    // dismiss — that would throw away an in-flight request the child can't get
    // back. Only the X closes the spinner; once revealed or errored, off-taps
    // and Esc dismiss as usual.
    allowDismiss: () => !aiResult.generating,
    // During the polaroid send-off the modal is animating away; swallow stray
    // backdrop taps without dismissing (the fly-out's end closes it).
    blockBackdropAt: () => exiting,
  })}
  onanimationend={handleAnimationEnd}
>
  <div class="ai-result-content">
    <button class="ai-result-close modal-close-btn" aria-label="Close" onclick={closeAiResult}>
      <Icon name="close" class="modal-close-icon" />
    </button>

    {#if aiResult.error}
      {@const safety = aiResult.error.kind === 'safety'}
      <div class="ai-result-error" class:safety>
        <span class="ai-result-error-emoji">{safety ? '🎨' : '😕'}</span>
        <p>{aiResult.error.message ?? "Hmm, that didn't work. Please try again!"}</p>
        {#if safety}
          <p class="ai-result-error-sub">
            That picture didn't work — try drawing something different!
          </p>
        {/if}
      </div>
    {:else}
      <div
        class="ai-stage"
        bind:this={aiStageEl}
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
          {#if aiResult.resultUrl || aiResult.previewUrl}
            <img
              class="stage-sizer"
              src={aiResult.resultUrl || aiResult.previewUrl}
              alt=""
              aria-hidden="true"
              onload={handleImgLoad}
            />
          {:else}
            <!-- Modal opened ahead of the export: reserve a drawing-shaped box so
                 the dial has a home until the blurred preview slots in. -->
            <div
              class="stage-sizer placeholder-sizer"
              style="aspect-ratio: {imgAspect};"
              aria-hidden="true"
            ></div>
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
          <AiDial bind:revealed bind:progress />
        {/if}
      </div>

      {#if loading}
        <div class="ai-loading-caption">
          <p class="ai-loading-title">{AI_LOADING_TITLE}</p>
          <p class="ai-loading-subtitle">{AI_LOADING_SUBTITLE}</p>
        </div>
      {/if}

      {#if revealed && aiResult.resultUrl}
        <div class="ai-result-footer">
          {#if settings.autoSaveAiEnabled}
            <p class="ai-result-saved">✓ Saved to your photos</p>
          {:else}
            <button class="ai-result-download" onclick={handleDownload}>
              <Icon name="download" class="ai-result-download-icon" />
              <span>Download</span>
            </button>
          {/if}
          <AiImageReport
            drawingUrl={aiResult.previewUrl}
            outputUrl={aiResult.resultUrl}
            style={aiResult.style}
            origin={reportOrigin}
            bind:status={reportStatus}
          />
        </div>
      {/if}
    {/if}
  </div>

  <!-- Stays mounted through the polaroid send-off so it fades out with the rest
       of the chrome (.polaroid-mode below) instead of vanishing on the first frame. -->
  {#if revealed && aiResult.resultUrl && !reportSettled}
    <AiResultDisclosure onclick={requestReport} disabled={!aiResult.previewUrl} />
  {/if}
</dialog>

<style>
  .ai-result-modal {
    --result-autosave-footer-reserve: 95px;
    --loading-caption-height: 46px;
    --result-sizing-air: 1px;
    --result-loading-reserve: calc(
      var(--space-4) + var(--space-4) + var(--space-3) + var(--loading-caption-height) +
        var(--result-sizing-air)
    );
    --result-footer-reserve: var(--result-loading-reserve);
    /* A definite width (not shrink-to-fit, which browsers resolve differently
       for a transform-centered fixed dialog). The image is centered inside with
       side spacing, so a tall render reads as a framed card rather than a strip. */
    width: min(96vw, 560px);
    /* The disclosure strip hangs below the card, so the card gives up the room
       the strip needs (mirrored above, since the card is transform-centered) —
       a short viewport shrinks the picture instead of pushing the strip
       off-screen. The reserve is unconditional so tapping Report, which stands
       a confirmation in front of this card, never resizes the picture behind
       it. */
    max-height: calc(100dvh - var(--report-strip-reserve));
    overflow: visible;
  }

  .ai-result-content {
    padding: var(--space-4);
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
  }

  .ai-result-close {
    z-index: 2;
  }

  /* ── Stage: holds the blurred drawing, the dial, and the final image ── */
  .ai-stage {
    position: relative;
    display: block;
    line-height: 0; /* drop the inline-image baseline gap under the sizer */
    border-radius: var(--radius-md);
    overflow: hidden;
    background: #fcfbf8;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    /* Own the touch gesture so the scoped pinch-zoom (use:pinchZoom) drives the
       preview instead of the browser — the drawing surface stays zoom-locked
       (ADR-0076). Size comes from .stage-sizer below — the modal shrink-wraps
       this box. */
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
     and the available viewport height (reserving the download row), sizing to
     whichever binds. It occupies layout (so the stage takes its size) but isn't
     painted — the .stage-img overlays show the actual picture. */
  .stage-sizer {
    display: block;
    visibility: hidden;
    width: auto;
    height: auto;
    /* Shrunk down so the image clears the viewport edges and leaves margin
       around the whole card. Width is capped to the content box; a tall image
       is limited by the height reserve (padding + gap + download + some air). */
    max-width: 100%;
    max-height: calc(100dvh - var(--result-footer-reserve) - var(--report-strip-reserve));
  }

  .ai-result-modal.autosave .stage-sizer {
    max-height: calc(100dvh - var(--result-autosave-footer-reserve) - var(--report-strip-reserve));
  }

  .ai-result-modal.loading:not(.autosave) .stage-sizer {
    max-height: calc(100dvh - var(--result-loading-reserve) - var(--report-strip-reserve));
  }

  /* No image yet (modal opened before the export finished): a definite width so
     the aspect-ratio resolves a height, giving the dial a stable box to sit in.
     A tall portrait drawing is reined in by max-height (width then follows). */
  .placeholder-sizer {
    width: min(84vw, 460px);
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
    transition:
      opacity 0.55s ease,
      transform 0.6s var(--ease-glide);
  }

  .result.shown {
    opacity: 1;
    transform: scale(1);
  }

  .ai-loading-caption {
    min-height: var(--loading-caption-height);
    padding: 0 var(--space-2);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    text-align: center;
    font-family: var(--font-family);
  }

  .ai-loading-caption p {
    margin: 0;
  }

  .ai-loading-title {
    color: var(--text);
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
  }

  .ai-loading-subtitle {
    color: var(--text-soft);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
  }

  /* ── Error state ── */
  .ai-result-error {
    width: min(86vw, 380px);
    min-height: 240px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    text-align: center;
    color: var(--text);
  }
  /* Emoji at illustration size — glyph art, not ramp type. */
  .ai-result-error-emoji {
    font-size: 48px;
  }
  .ai-result-error p {
    margin: 0;
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
  }
  .ai-result-error p.ai-result-error-sub {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-soft);
    max-width: 280px;
  }

  /* ── Saved caption (auto-save mode, replaces the Download button) ── */
  .ai-result-saved {
    margin: 0;
    color: var(--success-text);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    animation: downloadPop 0.4s backwards 0.25s var(--ease-pop);
  }

  .ai-result-footer {
    min-height: var(--loading-caption-height);
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
  }

  /* ── Download button ── */
  .ai-result-download {
    height: 44px;
    padding: 0 22px;
    /* --brand-solid, not --brand: the fill carries its 14px bold label, and
       --brand is only 3.4:1 against --on-brand (fails WCAG AA below
       large-text size). */
    background: var(--brand-solid);
    border: none;
    border-radius: var(--radius-pill);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--on-brand);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    box-shadow: 0 4px 12px rgba(var(--brand-rgb), 0.4);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--brand) 40%, transparent);
    transition:
      transform var(--duration-fast) ease,
      background var(--duration-base) ease;
    animation: downloadPop 0.4s backwards 0.25s var(--ease-pop);
  }

  /* Guard hover behind a real pointer: touch browsers apply :hover on tap and
     keep it sticky, leaving the button's background stuck after a tap. */
  @media (hover: hover) {
    .ai-result-download:hover {
      background: var(--brand-solid-hover);
    }
  }
  .ai-result-download:active {
    transform: scale(0.95);
  }

  @keyframes downloadPop {
    from {
      transform: scale(0);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }

  :global(.ai-result-download-icon) {
    width: 18px;
    height: 18px;
    pointer-events: none;
  }

  /* Solid white on the brand button in both themes (a filter over the themed
     icon re-ink would drift dark in dark mode). */
  :global(.ai-result-download-icon svg) {
    fill: var(--on-brand);
  }

  /* ── Polaroid send-off: tapping download morphs the whole modal into a
        polaroid that lingers, then sails off to the bottom-left and closes. ── */
  .ai-result-modal.polaroid-mode {
    background: #fdfcf7;
    /* Tilt and settle like a freshly printed photo, then fly off after a beat.
       The fly-out's delay (0.9s) covers the morph + a brief hold in the center. */
    transform: translate(-50%, -50%) rotate(-3deg);
    transition:
      transform 0.4s var(--ease-pop),
      background 0.4s ease;
    animation: ai-polaroid-fly 0.85s 0.9s cubic-bezier(0.55, 0, 0.85, 0.2) forwards;
  }

  /* Hide the controls so the card reads as a clean polaroid. The download
     button keeps its footprint, leaving the thick blank border at the bottom. */
  .ai-result-modal.polaroid-mode .ai-result-close,
  .ai-result-modal.polaroid-mode .ai-result-footer,
  .ai-result-modal.polaroid-mode :global(.ai-result-disclosure) {
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--duration-base) ease;
  }

  @keyframes ai-polaroid-fly {
    0% {
      transform: translate(-50%, -50%) rotate(-3deg);
      opacity: 1;
    }
    100% {
      transform: translate(calc(-50% - 42vw), calc(-50% + 48vh)) scale(0.12) rotate(-28deg);
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ai-result-modal.polaroid-mode {
      transition: none;
      animation: ai-polaroid-fly 0.4s 0.5s ease forwards;
    }
  }

  /* Very short viewports: shrink the error art so it still fits. */
  @media (max-height: 480px) {
    .ai-result-error {
      min-height: 0;
      height: calc(94vh - 96px);
    }
    .ai-result-error-emoji {
      font-size: 36px;
    }
  }
</style>

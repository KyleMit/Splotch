<script lang="ts">
  import DialogHeader from './design/DialogHeader.svelte';
  import Icon from './Icon.svelte';
  import AiImageReport, { type ImageReportStatus } from './AiImageReport.svelte';
  import AiResultDisclosure from './AiResultDisclosure.svelte';
  import AiResultStage from './AiResultStage.svelte';
  import Button from './design/Button.svelte';
  import { aiGenerationState } from '$lib/state/aiGeneration.svelte';
  import { closeAiResult, minimizeAiResult } from '$lib/state/aiGeneration.svelte';
  import AiResultError from './AiResultError.svelte';
  import { aiProgressState } from '$lib/state/aiProgress.svelte';
  import { settingsState } from '$lib/state/settings.svelte';
  import { modalDialog } from '$lib/actions/modalDialog.svelte';
  import { buttonCenter, type Origin } from '$lib/state/modal.svelte';
  import { requireParentalGate } from '$lib/state/parentalGate.svelte';
  import { AI_LOADING_SUBTITLE, AI_LOADING_TITLE } from '$lib/ai/loadingCopy';
  import { autoSaveFooter } from '$lib/ai/autoSaveCopy';
  import '$lib/components/deferredIcons';
  import { downloadAiResult } from '$lib/ai/resultDownload';

  let dialogEl: HTMLDialogElement;

  // Owned by the run rather than the card (state/aiProgress.svelte.ts): a
  // generation that finishes while minimized is revealed before this dialog is
  // ever shown again, so restoring it lands on the picture, not on the dial.
  const revealed = $derived(aiProgressState.revealed);
  const phase = $derived(aiGenerationState.phase);
  const open = $derived(phase.kind !== 'closed');
  const generating = $derived(phase.kind === 'generating');
  // The two phases with something to show, narrowed once so the markup below
  // reads their fields without re-checking the kind.
  const result = $derived(phase.kind === 'result' ? phase : null);
  const aiError = $derived(phase.kind === 'error' ? phase : null);
  const loading = $derived(open && !revealed && !aiError);
  const serverError = $derived(!!aiError && aiError.errorKind !== 'safety');
  // The window in which leaving is a real offer: once the picture has landed
  // there is nothing to go back to the canvas for, and minimizing a finished
  // result would be a way to lose it (ADR-0116).
  const waiting = $derived(loading && generating);
  const footer = $derived(autoSaveFooter(result?.autoSave ?? null));
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

  // Seed the stage with the window's aspect ratio as soon as generation starts
  // so the placeholder box closely matches the preview that slots in a beat later.
  let imgAspect = $state(DEFAULT_ASPECT);
  $effect(() => {
    if (generating && window.innerHeight > 0) {
      imgAspect = window.innerWidth / window.innerHeight;
    }
  });

  $effect(() => {
    if (!open || generating) {
      exiting = false;
      reportStatus = 'idle';
    }
  });

  // Handed to the card so its width can be the picture's own — see --result-aspect.
  const cardStyle = $derived(`--result-aspect: ${imgAspect.toFixed(4)};`);

  function handleDownload() {
    if (!result || exiting) return;
    downloadAiResult(result.url, result.type);

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
  class:autosave={settingsState.autoSaveAiEnabled}
  class:errored={!!aiError}
  class:serverError
  class:loading
  class:waiting
  style={cardStyle}
  bind:this={dialogEl}
  use:modalDialog={() => ({
    open: open && !aiGenerationState.minimized,
    // While the picture is still being made, dismissing tucks it into the corner
    // rather than throwing away an in-flight request the child can't get back
    // (ADR-0116). Once there is something to look at, dismissing means dismissing.
    onRequestClose: () => (generating ? minimizeAiResult() : closeAiResult()),
    allowDismiss: () => true,
    // During the polaroid send-off the modal is animating away; swallow stray
    // backdrop taps without dismissing (the fly-out's end closes it).
    blockBackdropAt: () => exiting,
  })}
  onanimationend={handleAnimationEnd}
>
  <DialogHeader
    closeClass="ai-result-close"
    closeLabel={generating ? 'Keep drawing while this is made' : 'Close'}
    onclose={() => (generating ? minimizeAiResult() : closeAiResult())}
  />
  <div class="ai-result-content">
    {#if aiError}
      <AiResultError
        error={aiError}
        previewUrl={aiGenerationState.previewUrl}
        style={aiGenerationState.style}
        attempts={aiGenerationState.consecutiveFailures}
        {reportOrigin}
        onRequestReport={requestReport}
        bind:status={reportStatus}
      />
    {:else}
      <AiResultStage {exiting} onaspect={(aspect) => (imgAspect = aspect)} />

      {#if loading}
        <div class="ai-loading-caption">
          <p class="ai-loading-title">{AI_LOADING_TITLE}</p>
          <p class="ai-loading-subtitle">{AI_LOADING_SUBTITLE}</p>
        </div>
      {/if}

      <!-- The X and the backdrop have done this since ADR-0116, but both read as
           "cancel" — the one thing this must never be mistaken for. Half a minute
           is long enough that the way out should be written down. -->
      {#if waiting}
        <div class="ai-keep-drawing">
          <Button variant="wash" onclick={minimizeAiResult}>Keep drawing while you wait</Button>
        </div>
      {/if}

      {#if revealed && result}
        <div class="ai-result-footer">
          {#if footer?.kind === 'saved'}
            <p class="ai-result-saved">✓ {footer.caption}</p>
          {:else if footer?.kind === 'downloadButton'}
            <button class="ai-result-download" onclick={handleDownload}>
              <Icon name="download" class="ai-result-download-icon" />
              <span>Download</span>
            </button>
          {/if}
          <AiImageReport
            drawingUrl={aiGenerationState.previewUrl}
            outputUrl={result.url}
            style={aiGenerationState.style}
            reportToken={result.reportToken}
            origin={reportOrigin}
            bind:status={reportStatus}
          />
        </div>
      {/if}
    {/if}
  </div>

  <!-- Stays mounted through the polaroid send-off so it fades out with the rest
       of the chrome (.polaroid-mode below) instead of vanishing on the first frame. -->
  {#if serverError && !reportSettled}
    <AiResultDisclosure kind="problem" onclick={requestReport} />
  {:else if revealed && result && !reportSettled}
    <AiResultDisclosure onclick={requestReport} disabled={!aiGenerationState.previewUrl} />
  {/if}
</dialog>

<style>
  .ai-result-modal {
    --result-autosave-footer-reserve: 95px;
    --loading-caption-height: 46px;
    --keep-drawing-height: 44px;
    --result-sizing-air: 1px;
    --result-loading-reserve: calc(
      var(--space-4) + var(--space-4) + var(--space-3) + var(--loading-caption-height) +
        var(--result-sizing-air)
    );
    --result-footer-reserve: var(--result-loading-reserve);
    --result-inline-padding: calc(2 * var(--space-4));
    /* Overwritten inline with the picture's own ratio the moment one is known;
       the 4:3 here only covers the frame before that. */
    --result-aspect: 1.3333;
    /* The clear space the card keeps between itself and the screen edges, so the
       result reads as something laid over the app rather than a takeover of it.
       A phone has no pixels to spare and gets barely more than a hairline; a big
       screen can afford a frame, and wants one. Driven by vmin, the scarce axis,
       so a short landscape window doesn't spend a desktop's gutter on the
       dimension it has least of. */
    --result-gutter-min: 10px;
    --result-gutter-max: 80px;
    /* The narrowest common phone, which should sit at the minimum, and the rate
       the gutter opens above it — 0.14 reaches the maximum around a 900px axis,
       a laptop's height. */
    --result-gutter-ramp-from: 390px;
    --result-gutter-ramp: 0.14;
    --result-gutter: clamp(
      var(--result-gutter-min),
      calc(
        var(--result-gutter-min) + (100vmin - var(--result-gutter-ramp-from)) *
          var(--result-gutter-ramp)
      ),
      var(--result-gutter-max)
    );

    /* The band the card may occupy, and its width bound outright — over the UA
       <dialog> max-width, which on a phone sat inside the band and widened its
       gutters. Each bound is the deeper of the gutter and what that edge demands:
       the display's inset, which `viewport-fit=cover` puts the viewport under
       (ADR-0026), and below, the room the disclosure strip hangs in (app.css),
       inside the bottom bound as the card's own fine print. */
    --result-top-bound: max(var(--safe-area-top), var(--result-gutter));
    --result-bottom-bound: max(var(--safe-area-bottom), var(--result-gutter));
    --result-side-bound: max(var(--safe-area-left), var(--safe-area-right), var(--result-gutter));

    --result-card-max-h: calc(100dvh - var(--result-top-bound) - var(--result-bottom-bound));
    --result-stage-max-h: calc(var(--result-card-max-h) - var(--result-footer-reserve));
    --result-max-w: calc(100vw - 2 * var(--result-side-bound));
    /* Floored so the caption, footer and error copy keep a readable measure
       under a narrow picture. */
    --result-min-w: min(var(--result-max-w), 340px);
    --result-stage-max-w: calc(var(--result-max-w) - var(--result-inline-padding));
    /* The band is not centered on the viewport whenever its two bounds differ,
       so the card is shifted onto the band's middle instead — half the
       difference, in whichever direction the deeper bound lies. */
    --result-shift-y: calc((var(--result-top-bound) - var(--result-bottom-bound)) / 2);

    max-width: var(--result-max-w);
    max-height: var(--result-card-max-h);
    overflow: visible;
    transform: translate(-50%, calc(-50% + var(--result-shift-y)));
  }

  /* The picture sets the card's width rather than the other way around: project
     the height budget above through the image's own aspect and that is the
     widest the picture can be drawn without letterboxing it. Below that floor —
     or past the viewport — the stage's own max-width takes over and the picture
     sits centered in a framed card, which is what a very tall render should do.

     A definite width, never shrink-to-fit, which browsers resolve differently
     for a transform-centered fixed dialog. The error state has no picture to
     size against, so it keeps a card sized for its copy. */
  .ai-result-modal.errored {
    width: min(var(--result-max-w), 560px);
  }

  .ai-result-modal:not(.errored) {
    width: clamp(
      var(--result-min-w),
      calc(var(--result-stage-max-h) * var(--result-aspect) + var(--result-inline-padding)),
      var(--result-max-w)
    );
  }

  /* The disclosure strip is what the bottom edge owes room to, so it deepens
     that bound — and the height budget and the shift follow from it above. The
     loading state claims the reserve though its strip is still to come, so
     the card doesn't move under the reveal, and it stays claimed while the
     confirmation dialog stands in front of this card, so the picture behind
     doesn't resize under it. */
  .ai-result-modal:not(.errored),
  .ai-result-modal.serverError {
    --result-bottom-bound: max(var(--report-strip-reserve), var(--result-gutter));
  }

  .ai-result-modal.autosave {
    --result-footer-reserve: var(--result-autosave-footer-reserve);
  }

  /* The keep-drawing pill is the one thing under the picture that has no
     counterpart after the reveal, so while it is up the stage keeps its height
     out of the budget. It follows .autosave deliberately: whichever footer the
     revealed card will have, the waiting card owes room for this one first. The
     finished picture is never the thing that pays for it. */
  .ai-result-modal.waiting {
    --result-footer-reserve: calc(
      var(--result-loading-reserve) + var(--space-3) + var(--keep-drawing-height)
    );
  }

  .ai-result-content {
    padding: var(--space-4);
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
  }

  :global(.ai-result-close) {
    z-index: 2;
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

  /* Shaped like the Download button it stands in the same place as, so the two
     read as one slot the card fills differently before and after the picture. */
  .ai-keep-drawing :global(.btn) {
    min-height: var(--keep-drawing-height);
    padding: 0 22px;
    border-radius: var(--radius-pill);
    font-weight: var(--font-weight-bold);
  }

  .ai-result-modal.serverError {
    width: min(var(--result-max-w), 400px);
  }

  .serverError .ai-result-content {
    padding: var(--space-7) var(--space-6) var(--space-6);
    max-height: var(--result-card-max-h);
    overflow-y: auto;
    border-radius: inherit;
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
    background: var(--polaroid-paper);
    /* Tilt and settle like a freshly printed photo, then fly off after a beat.
       The fly-out's delay (0.9s) covers the morph + a brief hold in the center.
       Keeps --result-shift-y so the tilt doesn't also drop the card back down. */
    transform: translate(-50%, calc(-50% + var(--result-shift-y))) rotate(-3deg);
    transition:
      transform 0.4s var(--ease-pop),
      background 0.4s ease;
    animation: ai-polaroid-fly 0.85s 0.9s cubic-bezier(0.55, 0, 0.85, 0.2) forwards;
  }

  /* Hide the controls so the card reads as a clean polaroid. The download
     button keeps its footprint, leaving the thick blank border at the bottom. */
  .ai-result-modal.polaroid-mode :global(.ai-result-close),
  .ai-result-modal.polaroid-mode .ai-result-footer,
  .ai-result-modal.polaroid-mode :global(.ai-result-disclosure) {
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--duration-base) ease;
  }

  @keyframes ai-polaroid-fly {
    0% {
      transform: translate(-50%, calc(-50% + var(--result-shift-y))) rotate(-3deg);
      opacity: 1;
    }
    100% {
      transform: translate(calc(-50% - 42vw), calc(-50% + 48vh)) scale(0.12) rotate(-28deg);
      opacity: 0;
    }
  }

  :global(:root[data-reduce-motion]) .ai-result-modal.polaroid-mode {
    transition: none;
    animation: ai-polaroid-fly 0.4s 0.5s ease forwards;
  }
</style>

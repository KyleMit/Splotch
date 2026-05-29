<script>
  import { scale } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import Icon from './Icon.svelte';
  import { ui, closeAiResult } from '$lib/state/ui.svelte.js';

  let dialogEl;

  // ── Progress dial state ────────────────────────────────────────────────
  // We can't know exactly when the backend finishes, but it's ~10s. The dial
  // eases toward (but never reaches) "done" over that estimate; if it runs long
  // it creeps slowly; once the real image arrives it races to 100% and reveals.
  const ESTIMATE = 10000;

  let progress = $state(0); // 0 → 1
  let revealed = $state(false); // final image crossfaded in
  let waiting = $state(false); // overran the estimate, gently reassuring
  let exiting = $state(false); // download tapped: modal morphs into a polaroid and flies off

  let rafId = 0;
  let startTime = 0;
  let done = false; // the real image has arrived

  // Mostly-linear so it advances at a steady, even pace — just a touch of sine
  // easing softens the very start and end without a slow ramp or a late rush.
  const fillCurve = (t) => 0.55 * t + 0.45 * (-(Math.cos(Math.PI * t) - 1) / 2);

  function loop(now) {
    const elapsed = now - startTime;
    if (!done) {
      if (elapsed < ESTIMATE) {
        // Steadily fill to ~92% across the estimated duration.
        progress = 0.92 * fillCurve(elapsed / ESTIMATE);
        waiting = false;
      } else {
        // Taking longer than expected — creep asymptotically toward ~98%.
        const over = elapsed - ESTIMATE;
        progress = 0.92 + 0.06 * (1 - Math.exp(-over / 5000));
        waiting = true;
      }
    } else {
      // Image is here: ease quickly to a full circle, then reveal.
      waiting = false;
      progress += (1 - progress) * 0.16;
      if (progress >= 0.999) {
        progress = 1;
        revealed = true;
        rafId = 0;
        return;
      }
    }
    rafId = requestAnimationFrame(loop);
  }

  function startDial() {
    cancelAnimationFrame(rafId);
    progress = 0;
    revealed = false;
    waiting = false;
    done = false;
    startTime = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function stopDial() {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  // Begin the dial as soon as generation starts.
  $effect(() => {
    if (ui.aiResultOpen && ui.aiGenerating) startDial();
  });

  // When the finished image arrives, let the dial race to completion.
  $effect(() => {
    if (ui.aiResultOpen && !ui.aiGenerating && ui.aiResultUrl) {
      done = true;
      if (!rafId) rafId = requestAnimationFrame(loop);
    }
  });

  // Stop spinning on error.
  $effect(() => {
    if (ui.aiError) stopDial();
  });

  // Tear everything down when the modal closes.
  $effect(() => {
    if (!ui.aiResultOpen) {
      stopDial();
      progress = 0;
      revealed = false;
      waiting = false;
      done = false;
      exiting = false;
    }
  });

  // Show/hide the native dialog.
  $effect(() => {
    if (!dialogEl) return;
    if (ui.aiResultOpen) {
      if (!dialogEl.open) dialogEl.showModal();
    } else {
      if (dialogEl.open) dialogEl.close();
    }
  });

  // ── Derived visuals ────────────────────────────────────────────────────
  // A friendly violet → blue → teal → green sweep as the dial fills — no
  // alarming red at the start. Two offset hues give the wedge a gradient
  // rather than a flat fill, ending on a satisfying green when it's done.
  const hueA = $derived(282 - 132 * progress); // 282 (violet) → 150 (green)
  const dialColor = $derived(`hsl(${hueA}, 82%, 62%)`);
  const dialColor2 = $derived(`hsl(${hueA + 46}, 88%, 67%)`);
  // Remaining wedge, depleting clockwise from a full circle.
  const wedgeAngle = $derived(`${(1 - progress) * 360}deg`);
  // The drawing stays blurry to keep the suspense, sharpening as we progress.
  const previewBlur = $derived(`${2 + 16 * (1 - progress)}px`);

  // Confetti that drifts gently down behind the dial like falling leaves while
  // we wait — slow, with a wavy side-to-side sway. Values are derived
  // deterministically from the index (via Math.sin) so the server and client
  // render identical markup — no hydration mismatch.
  const CONFETTI_COLORS = ['#FF6FB5', '#FFD23F', '#5CC8FF', '#7BE08A', '#C792EA', '#FF9E4D'];
  const confetti = Array.from({ length: 38 }, (_, i) => {
    const r = (seed) => {
      const x = Math.sin((i + 1) * seed) * 10000;
      return x - Math.floor(x);
    };
    return {
      left: 2 + r(12.9) * 96, // spread across the full width
      delay: -r(57.3) * 9, // negative so leaves are already mid-fall at frame 0
      duration: 5.5 + r(31.7) * 4.5, // 5.5–10s — slow and gentle
      sway: (r(45.1) * 2 - 1) * (16 + r(8.3) * 24), // signed amplitude 16–40px
      size: 6 + r(77.7) * 6,
      color: CONFETTI_COLORS[Math.floor(r(51.3) * CONFETTI_COLORS.length)],
      round: r(27.1) < 0.4
    };
  });

  function timestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  }

  function handleDownload() {
    if (!ui.aiResultUrl || exiting) return;
    const a = document.createElement('a');
    a.href = ui.aiResultUrl;
    a.download = `splotch-ai-${timestamp()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    // Morph the modal into a polaroid, hold it in the center, then let it fly
    // off to the bottom-left. The fly-out animation's end dismisses the modal.
    exiting = true;
  }

  // Fires when the polaroid fly-out finishes. We match on target rather than
  // animation name because Svelte scopes local @keyframes names at build time
  // (e.g. "svelte-abc123-ai-polaroid-fly"), so an exact name check won't match.
  // The dialog's only own animation is the fly-out; child animations (confetti,
  // the dial out-transition, the download pop) bubble up but have a different
  // target, so this stays specific to the send-off.
  function handleAnimationEnd(e) {
    if (exiting && e.target === dialogEl) {
      closeAiResult();
    }
  }

  function handleDialogPointerDown(e) {
    if (exiting) return;
    const rect = dialogEl.getBoundingClientRect();
    const inside =
      e.clientX >= rect.left && e.clientX <= rect.right &&
      e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!inside) {
      closeAiResult();
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function handleDialogClose() {
    if (ui.aiResultOpen) closeAiResult();
  }
</script>

<dialog
  class="ai-result-modal"
  class:polaroid-mode={exiting}
  bind:this={dialogEl}
  onpointerdown={handleDialogPointerDown}
  onclose={handleDialogClose}
  onanimationend={handleAnimationEnd}
>
  <div class="ai-result-content">
    <button class="ai-result-close" aria-label="Close" onclick={closeAiResult}>
      <Icon name="close" class="ai-result-close-icon" />
    </button>

    {#if ui.aiError}
      <div class="ai-result-error">
        <span class="ai-result-error-emoji">😕</span>
        <p>Hmm, that didn't work. Please try again!</p>
      </div>
    {:else}
      <div class="ai-stage">
        {#if ui.aiPreviewUrl}
          <img
            class="stage-img preview"
            class:gone={revealed}
            style="filter: blur({previewBlur}) saturate(1.1);"
            src={ui.aiPreviewUrl}
            alt=""
          />
        {/if}

        {#if ui.aiResultUrl}
          <img class="stage-img result" class:shown={revealed} src={ui.aiResultUrl} alt="" />
        {/if}

        {#if !revealed}
          <div class="confetti-layer" aria-hidden="true">
            {#each confetti as c}
              <span
                class="confetti"
                class:round={c.round}
                style="left: {c.left}%; width: {c.size}px; height: {c.size}px; background: {c.color}; --delay: {c.delay}s; --duration: {c.duration}s; --sway: {c.sway}px;"
              ></span>
            {/each}
          </div>

          <div
            class="dial"
            class:waiting
            style="--c1: {dialColor}; --c2: {dialColor2}; --angle: {wedgeAngle};"
            out:scale={{ duration: 480, start: 1.35, opacity: 0, easing: backOut }}
          >
            <div class="dial-glow"></div>
            <div class="dial-pie"></div>
            <div class="dial-sheen"></div>
            <div class="dial-core"></div>
          </div>
        {/if}
      </div>

      {#if revealed && ui.aiResultUrl}
        <button class="ai-result-download" onclick={handleDownload}>
          <Icon name="download" class="ai-result-download-icon" />
          <span>Download</span>
        </button>
      {/if}
    {/if}
  </div>
</dialog>

<style>
  .ai-result-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    margin: 0;
    background: white;
    border: none;
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    max-width: 640px;
    width: 90%;
    max-height: 85vh;
    overflow: hidden;
    padding: 0;
  }

  .ai-result-modal::backdrop {
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }

  .ai-result-content {
    padding: 32px;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }

  .ai-result-close {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 32px;
    height: 32px;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
  }

  :global(.ai-result-close-icon) {
    width: 100%;
    height: 100%;
    pointer-events: none;
    filter: invert(60%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(100%) contrast(85%);
    transition: filter 0.2s ease;
  }

  .ai-result-close:hover :global(.ai-result-close-icon) {
    filter: invert(30%) sepia(0%) saturate(0%) hue-rotate(0deg) brightness(95%) contrast(90%);
  }

  /* ── Stage: holds the blurred drawing, the dial, and the final image ── */
  .ai-stage {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 3;
    border-radius: 12px;
    overflow: hidden;
    background: #fcfbf8;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  }

  .stage-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .preview {
    transition: opacity 0.5s ease, filter 0.2s linear;
    transform: scale(1.04); /* hide blur bleed at edges */
  }

  .preview.gone {
    opacity: 0;
  }

  .result {
    opacity: 0;
    transform: scale(1.08);
    transition: opacity 0.55s ease, transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .result.shown {
    opacity: 1;
    transform: scale(1);
  }

  /* ── The radial timer dial ── */
  .dial {
    position: absolute;
    width: 52%;
    aspect-ratio: 1;
    border-radius: 50%;
    z-index: 2;
    will-change: transform;
  }

  /* Soft colored glow that bleeds onto the image behind the dial. */
  .dial-glow {
    position: absolute;
    inset: -14%;
    border-radius: 50%;
    background: radial-gradient(circle, var(--c2) 0%, var(--c1) 40%, transparent 70%);
    opacity: 0.5;
    filter: blur(7px);
  }

  /* The depleting pie wedge — a full circle at the start, draining clockwise.
     Two offset hues give the filled arc a candy gradient. */
  .dial-pie {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: conic-gradient(
      from 0deg,
      var(--c1),
      var(--c2) var(--angle),
      rgba(255, 255, 255, 0.1) var(--angle)
    );
    box-shadow: inset 0 0 24px rgba(0, 0, 0, 0.18);
  }

  /* Inner radial highlight to give the wedge a glossy, candy-like sheen. */
  .dial-sheen {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: radial-gradient(
      circle at 38% 32%,
      rgba(255, 255, 255, 0.55) 0%,
      rgba(255, 255, 255, 0.12) 32%,
      transparent 60%
    );
    pointer-events: none;
  }

  /* Center hub. */
  .dial-core {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 14%;
    aspect-ratio: 1;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    background: white;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  }

  /* ── Confetti: bits drifting gently down behind the dial like falling leaves ── */
  .confetti-layer {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    overflow: hidden;
    /* Punch a circular hole where the dial sits so leaves don't show through its
       translucent face — they fall behind it and vanish into it. The ellipse is
       sized in % of the 4:3 stage, so it stays a circle matching the dial. */
    -webkit-mask-image: radial-gradient(
      ellipse 31% 41% at 50% 50%,
      transparent 0,
      transparent 95%,
      #000 100%
    );
    mask-image: radial-gradient(
      ellipse 31% 41% at 50% 50%,
      transparent 0,
      transparent 95%,
      #000 100%
    );
  }

  .confetti {
    position: absolute;
    top: 0;
    border-radius: 2px;
    opacity: 0;
    will-change: transform, opacity;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
    animation: leafFall var(--duration) var(--delay) linear infinite;
  }

  .confetti.round {
    border-radius: 50%;
  }

  /* Falls top → bottom while swaying left/right and tumbling, like a leaf. */
  @keyframes leafFall {
    0% {
      transform: translateY(-40px) translateX(0) rotate(0deg);
      opacity: 0;
    }
    8% {
      opacity: 1;
    }
    25% {
      transform: translateY(110px) translateX(var(--sway)) rotate(55deg);
    }
    50% {
      transform: translateY(260px) translateX(calc(var(--sway) * -1)) rotate(-40deg);
    }
    75% {
      transform: translateY(410px) translateX(var(--sway)) rotate(65deg);
    }
    90% {
      opacity: 1;
    }
    100% {
      transform: translateY(540px) translateX(0) rotate(-20deg);
      opacity: 0;
    }
  }

  /* When we overrun the estimate, gently pulse to reassure. */
  .dial.waiting {
    animation: dialPulse 1.6s ease-in-out infinite;
  }

  @keyframes dialPulse {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.045);
    }
  }

  /* ── Error state ── */
  .ai-result-error {
    width: 100%;
    aspect-ratio: 4 / 3;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    text-align: center;
    color: #555;
  }
  .ai-result-error-emoji {
    font-size: 48px;
  }
  .ai-result-error p {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  /* ── Download button ── */
  .ai-result-download {
    height: 56px;
    padding: 0 30px;
    background: #ab71e1;
    border: none;
    border-radius: 28px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: white;
    font-size: 17px;
    font-weight: 700;
    box-shadow: 0 4px 12px rgba(171, 113, 225, 0.4);
    transition: transform 0.15s ease, background 0.2s ease;
    animation: downloadPop 0.4s backwards 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .ai-result-download:hover { background: #9559cd; }
  .ai-result-download:active { transform: scale(0.95); }

  @keyframes downloadPop {
    from { transform: scale(0); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }

  :global(.ai-result-download-icon) {
    width: 22px;
    height: 22px;
    pointer-events: none;
    filter: invert(100%);
  }

  /* ── Polaroid send-off: tapping download morphs the whole modal into a
        polaroid that lingers, then sails off to the bottom-left and closes. ── */
  .ai-result-modal.polaroid-mode {
    background: #fdfcf7;
    /* Tilt and settle like a freshly printed photo, then fly off after a beat.
       The fly-out's delay (0.9s) covers the morph + a brief hold in the center. */
    transform: translate(-50%, -50%) rotate(-3deg);
    transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.4s ease;
    animation: ai-polaroid-fly 0.85s 0.9s cubic-bezier(0.55, 0, 0.85, 0.2) forwards;
  }

  /* Hide the controls so the card reads as a clean polaroid. The download
     button keeps its footprint, leaving the thick blank border at the bottom. */
  .ai-result-modal.polaroid-mode .ai-result-close,
  .ai-result-modal.polaroid-mode .ai-result-download {
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.25s ease;
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

  @media (prefers-reduced-motion: reduce) {
    .dial.waiting {
      animation: none;
    }
    .confetti {
      animation: none;
      opacity: 0;
    }
  }
</style>

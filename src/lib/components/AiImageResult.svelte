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

  let rafId = 0;
  let startTime = 0;
  let done = false; // the real image has arrived

  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  function loop(now) {
    const elapsed = now - startTime;
    if (!done) {
      if (elapsed < ESTIMATE) {
        // Smoothly fill to ~90% across the estimated duration.
        progress = 0.9 * easeOutCubic(elapsed / ESTIMATE);
        waiting = false;
      } else {
        // Taking longer than expected — creep asymptotically toward ~98%.
        const over = elapsed - ESTIMATE;
        progress = 0.9 + 0.085 * (1 - Math.exp(-over / 5000));
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
  // Red → orange → yellow → green as progress climbs (hue 0 → 130).
  const dialColor = $derived(`hsl(${Math.round(progress * 130)}, 85%, 55%)`);
  // Remaining wedge, depleting clockwise from a full circle.
  const wedgeAngle = $derived(`${(1 - progress) * 360}deg`);
  // The drawing stays blurry to keep the suspense, sharpening as we progress.
  const previewBlur = $derived(`${2 + 16 * (1 - progress)}px`);

  const sparkles = [
    { x: 50, y: -4, d: 0, s: 1 },
    { x: 96, y: 26, d: 0.4, s: 0.7 },
    { x: 104, y: 70, d: 0.9, s: 0.85 },
    { x: 72, y: 102, d: 1.3, s: 0.6 },
    { x: 24, y: 100, d: 0.6, s: 0.9 },
    { x: -4, y: 64, d: 1.1, s: 0.7 },
    { x: 2, y: 22, d: 1.5, s: 0.8 }
  ];

  function timestamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  }

  function handleDownload() {
    if (!ui.aiResultUrl) return;
    const a = document.createElement('a');
    a.href = ui.aiResultUrl;
    a.download = `splotch-ai-${timestamp()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function handleDialogPointerDown(e) {
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
  bind:this={dialogEl}
  onpointerdown={handleDialogPointerDown}
  onclose={handleDialogClose}
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
          <div
            class="dial"
            class:waiting
            style="--c: {dialColor}; --angle: {wedgeAngle};"
            out:scale={{ duration: 480, start: 1.35, opacity: 0, easing: backOut }}
          >
            <div class="dial-glow"></div>
            <div class="dial-pie"></div>
            <div class="dial-sheen"></div>
            <div class="dial-ring"></div>
            <div class="dial-core"></div>
            {#each sparkles as sp}
              <span
                class="sparkle"
                style="left: {sp.x}%; top: {sp.y}%; --delay: {sp.d}s; --scale: {sp.s};"
              ></span>
            {/each}
          </div>
        {/if}
      </div>

      {#if revealed && ui.aiResultUrl}
        <button class="ai-result-download" aria-label="Download" onclick={handleDownload}>
          <Icon name="download" class="ai-result-download-icon" />
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
    z-index: 1;
    will-change: transform;
  }

  /* Soft colored glow that bleeds onto the image behind the dial. */
  .dial-glow {
    position: absolute;
    inset: -14%;
    border-radius: 50%;
    background: radial-gradient(circle, var(--c) 0%, transparent 68%);
    opacity: 0.45;
    filter: blur(6px);
  }

  /* The depleting pie wedge — a full circle at the start, draining clockwise. */
  .dial-pie {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: conic-gradient(from 0deg, var(--c) var(--angle), rgba(255, 255, 255, 0.08) var(--angle));
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

  /* Outer frame ring. */
  .dial-ring {
    position: absolute;
    inset: -5%;
    border-radius: 50%;
    border: 5px solid rgba(255, 255, 255, 0.9);
    box-shadow:
      0 4px 14px rgba(0, 0, 0, 0.22),
      inset 0 0 0 2px rgba(0, 0, 0, 0.04);
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

  /* Twinkling sparkles around the dial. */
  .sparkle {
    position: absolute;
    width: 14px;
    height: 14px;
    transform: translate(-50%, -50%) scale(var(--scale));
    background:
      radial-gradient(circle, rgba(255, 255, 255, 0.95) 0%, transparent 70%);
    pointer-events: none;
    animation: sparkleTwinkle 1.8s ease-in-out infinite;
    animation-delay: var(--delay);
  }

  .sparkle::before,
  .sparkle::after {
    content: '';
    position: absolute;
    inset: 0;
    background: white;
    border-radius: 1px;
    box-shadow: 0 0 6px 1px rgba(255, 255, 255, 0.9);
  }

  /* 4-point star using two crossed bars. */
  .sparkle::before {
    clip-path: polygon(50% 0, 58% 42%, 100% 50%, 58% 58%, 50% 100%, 42% 58%, 0 50%, 42% 42%);
  }
  .sparkle::after {
    transform: rotate(45deg) scale(0.5);
    clip-path: polygon(50% 0, 58% 42%, 100% 50%, 58% 58%, 50% 100%, 42% 58%, 0 50%, 42% 42%);
    opacity: 0.7;
  }

  /* When we overrun the estimate, gently pulse to reassure. */
  .dial.waiting {
    animation: dialPulse 1.6s ease-in-out infinite;
  }
  .dial.waiting .sparkle {
    animation-duration: 1.1s;
  }

  @keyframes dialPulse {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.045);
    }
  }

  @keyframes sparkleTwinkle {
    0%, 100% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(calc(var(--scale) * 0.3)) rotate(0deg);
    }
    50% {
      opacity: 1;
      transform: translate(-50%, -50%) scale(var(--scale)) rotate(45deg);
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
    width: 56px;
    height: 56px;
    background: #ab71e1;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 14px;
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
    width: 100%;
    height: 100%;
    pointer-events: none;
    filter: invert(100%);
  }

  @media (prefers-reduced-motion: reduce) {
    .dial.waiting,
    .sparkle {
      animation: none;
    }
    .sparkle { opacity: 0.85; }
  }
</style>

<script lang="ts">
  import { scale } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { ui } from '$lib/state/ui.svelte';

  interface Props {
    revealed?: boolean;
    progress?: number;
  }

  let { revealed = $bindable(false), progress = $bindable(0) }: Props = $props();

  const ESTIMATE = 10000;

  let waiting = $state(false);
  let rafId = 0;
  let startTime = 0;
  let done = false;

  // Mostly-linear so it advances at a steady, even pace — just a touch of sine
  // easing softens the very start and end without a slow ramp or a late rush.
  const fillCurve = (t: number) => 0.55 * t + 0.45 * (-(Math.cos(Math.PI * t) - 1) / 2);

  function loop(now: number) {
    const elapsed = now - startTime;
    if (!done) {
      if (elapsed < ESTIMATE) {
        progress = 0.92 * fillCurve(elapsed / ESTIMATE);
        waiting = false;
      } else {
        const over = elapsed - ESTIMATE;
        progress = 0.92 + 0.06 * (1 - Math.exp(-over / 5000));
        waiting = true;
      }
    } else {
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

  $effect(() => {
    if (ui.aiResultOpen && ui.aiGenerating) startDial();
  });

  $effect(() => {
    if (ui.aiResultOpen && !ui.aiGenerating && ui.aiResultUrl) {
      done = true;
      if (!rafId) rafId = requestAnimationFrame(loop);
    }
  });

  $effect(() => {
    if (ui.aiError) stopDial();
  });

  // The reactive stop paths above are skipped if the parent unmounts this
  // component in the same flush (e.g. the aiError branch swap), so the rAF
  // loop must also be cancelled unconditionally at destroy.
  $effect(() => () => cancelAnimationFrame(rafId));

  $effect(() => {
    if (!ui.aiResultOpen) {
      stopDial();
      progress = 0;
      revealed = false;
      waiting = false;
      done = false;
    }
  });

  // A friendly violet → blue → teal → green sweep as the dial fills.
  const hueA = $derived(282 - 132 * progress);
  const dialColor = $derived(`hsl(${hueA}, 82%, 62%)`);
  const dialColor2 = $derived(`hsl(${hueA + 46}, 88%, 67%)`);
  const wedgeAngle = $derived(`${(1 - progress) * 360}deg`);
</script>

<div class="dial-wrap">
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
</div>

<style>
  .dial-wrap {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
    pointer-events: none;
  }

  .dial {
    position: relative;
    width: 52%;
    aspect-ratio: 1;
    border-radius: 50%;
    will-change: transform;
  }

  .dial-glow {
    position: absolute;
    inset: -14%;
    border-radius: 50%;
    background: radial-gradient(circle, var(--c2) 0%, var(--c1) 40%, transparent 70%);
    opacity: 0.5;
    filter: blur(7px);
  }

  /* The depleting pie wedge — a full circle at the start, draining clockwise. */
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

  .dial.waiting {
    animation: dialPulse 1.6s ease-in-out infinite;
  }

  @keyframes dialPulse {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.045);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dial.waiting {
      animation: none;
    }
  }
</style>

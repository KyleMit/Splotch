<script lang="ts">
  import { scale } from 'svelte/transition';
  import { backOut } from 'svelte/easing';
  import { aiProgress } from '$lib/state/aiProgress.svelte';
  import { DIAL_MAX_SIZE_PX, DIAL_STAGE_FRACTION } from './aiDialGeometry';

  const HUE_START_DEG = 282;
  const HUE_SWEEP_DEG = 132;
  const HUE_SECOND_STOP_OFFSET_DEG = 46;
  const DIAL_EXIT_MS = 480;
  const DIAL_EXIT_START_SCALE = 1.35;

  // A pure view of the shared progress (state/aiProgress.svelte.ts): the loop
  // that fills this belongs to the run, not to the dial, so minimizing and
  // restoring the modal never restarts it.
  const progress = $derived(aiProgress.value);

  // A friendly violet → blue → teal → green sweep as the dial fills.
  const hueA = $derived(HUE_START_DEG - HUE_SWEEP_DEG * progress);
  const dialColor = $derived(`hsl(${hueA}, 82%, 62%)`);
  const dialColor2 = $derived(`hsl(${hueA + HUE_SECOND_STOP_OFFSET_DEG}, 88%, 67%)`);
  const wedgeAngle = $derived(`${(1 - progress) * 360}deg`);
</script>

<div class="dial-wrap">
  <div
    class="dial"
    class:waiting={aiProgress.waiting}
    style="--c1: {dialColor}; --c2: {dialColor2}; --angle: {wedgeAngle}; --dial-size: min({DIAL_STAGE_FRACTION *
      100}%, {DIAL_MAX_SIZE_PX}px);"
    out:scale={{
      duration: DIAL_EXIT_MS,
      start: DIAL_EXIT_START_SCALE,
      opacity: 0,
      easing: backOut,
    }}
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
    width: var(--dial-size);
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

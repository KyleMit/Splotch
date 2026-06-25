<script lang="ts">
  const CONFETTI_COLORS = ['#FF6FB5', '#FFD23F', '#5CC8FF', '#7BE08A', '#C792EA', '#FF9E4D'];

  // Values derived deterministically from the index (via Math.sin) so the server
  // and client render identical markup — no hydration mismatch.
  const confetti = Array.from({ length: 38 }, (_, i) => {
    const r = (seed: number) => {
      const x = Math.sin((i + 1) * seed) * 10000;
      return x - Math.floor(x);
    };
    return {
      left: 2 + r(12.9) * 96,
      delay: -r(57.3) * 9,
      duration: 5.5 + r(31.7) * 4.5,
      sway: (r(45.1) * 2 - 1) * (16 + r(8.3) * 24),
      size: 6 + r(77.7) * 6,
      color: CONFETTI_COLORS[Math.floor(r(51.3) * CONFETTI_COLORS.length)],
      round: r(27.1) < 0.4,
    };
  });
</script>

<div class="confetti-layer" aria-hidden="true">
  {#each confetti as c, i (i)}
    <span
      class="confetti"
      class:round={c.round}
      style="left: {c.left}%; width: {c.size}px; height: {c.size}px; background: {c.color}; --delay: {c.delay}s; --duration: {c.duration}s; --sway: {c.sway}px;"
    ></span>
  {/each}
</div>

<style>
  /* Punch a circular hole where the dial sits so leaves don't show through its
     translucent face — they fall behind it and vanish into it. The ellipse is
     sized in % of the stage, tracking the fixed horizontal radius (31% of width)
     via the --confetti-ry CSS var set by the parent on .ai-stage. */
  .confetti-layer {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    overflow: hidden;
    -webkit-mask-image: radial-gradient(
      ellipse 31% var(--confetti-ry, 41%) at 50% 50%,
      transparent 0,
      transparent 95%,
      #000 100%
    );
    mask-image: radial-gradient(
      ellipse 31% var(--confetti-ry, 41%) at 50% 50%,
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

  @media (prefers-reduced-motion: reduce) {
    .confetti {
      animation: none;
      opacity: 0;
    }
  }
</style>

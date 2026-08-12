<script lang="ts">
  const CONFETTI_COLORS = ['#FF6FB5', '#FFD23F', '#5CC8FF', '#7BE08A', '#C792EA', '#FF9E4D'];

  const CONFETTI_COUNT = 38;

  // One arbitrary seed per property so hashUnit() maps each index to an
  // independent-looking [0,1) value.
  const HASH_SEED = {
    left: 12.9,
    delay: 57.3,
    duration: 31.7,
    swaySign: 45.1,
    swayMagnitude: 8.3,
    size: 77.7,
    color: 51.3,
    round: 27.1,
  };

  const LEFT_MIN = 2;
  const LEFT_SPAN = 96;
  const DELAY_SPAN = 9;
  const DURATION_MIN = 5.5;
  const DURATION_SPAN = 4.5;
  const SWAY_MIN = 16;
  const SWAY_SPAN = 24;
  const SIZE_MIN = 6;
  const SIZE_SPAN = 6;
  const ROUND_FRACTION = 0.4;

  // Deterministic fract-hash: maps an index to a stable [0,1) value so the
  // server and client render identical markup — no hydration mismatch.
  function hashUnit(i: number, seed: number): number {
    const x = Math.sin((i + 1) * seed) * 10000;
    return x - Math.floor(x);
  }

  const confetti = Array.from({ length: CONFETTI_COUNT }, (_, i) => {
    const r = (seed: number) => hashUnit(i, seed);
    return {
      left: LEFT_MIN + r(HASH_SEED.left) * LEFT_SPAN,
      delay: -r(HASH_SEED.delay) * DELAY_SPAN,
      duration: DURATION_MIN + r(HASH_SEED.duration) * DURATION_SPAN,
      sway: (r(HASH_SEED.swaySign) * 2 - 1) * (SWAY_MIN + r(HASH_SEED.swayMagnitude) * SWAY_SPAN),
      size: SIZE_MIN + r(HASH_SEED.size) * SIZE_SPAN,
      color: CONFETTI_COLORS[Math.floor(r(HASH_SEED.color) * CONFETTI_COLORS.length)],
      round: r(HASH_SEED.round) < ROUND_FRACTION,
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
     translucent face — they fall behind it and vanish into it. Both radii arrive
     as --confetti-rx/--confetti-ry CSS vars set by the parent on .ai-stage,
     derived there from the dial's own geometry once the stage has been measured.
     The literal fallbacks cover the frame before that, and mirror a 4:3 stage
     small enough that the dial has not yet reached its size cap. */
  .confetti-layer {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    overflow: hidden;
    --confetti-mask: radial-gradient(
      ellipse var(--confetti-rx, 31%) var(--confetti-ry, 41%) at 50% 50%,
      transparent 0,
      transparent 95%,
      #000 100%
    );
    -webkit-mask-image: var(--confetti-mask);
    mask-image: var(--confetti-mask);
  }

  .confetti {
    position: absolute;
    top: 0;
    border-radius: 2px;
    opacity: 0;
    will-change: transform, opacity;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
    animation: leafFall var(--duration) var(--delay) linear infinite;
    /* Fall-path stops as a fraction of --stage-h (the real stage height, set by
       the parent's ResizeObserver) — derived from the original fixed-540px
       ladder's own proportions (110/540, 260/540, 410/540) so the fall keeps
       the same easing feel while spanning whatever height the stage actually
       renders at. */
    --fall-25: 0.204;
    --fall-50: 0.481;
    --fall-75: 0.759;
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
      transform: translateY(calc(var(--stage-h, 540px) * var(--fall-25))) translateX(var(--sway))
        rotate(55deg);
    }
    50% {
      transform: translateY(calc(var(--stage-h, 540px) * var(--fall-50)))
        translateX(calc(var(--sway) * -1)) rotate(-40deg);
    }
    75% {
      transform: translateY(calc(var(--stage-h, 540px) * var(--fall-75))) translateX(var(--sway))
        rotate(65deg);
    }
    90% {
      opacity: 1;
    }
    100% {
      transform: translateY(calc(var(--stage-h, 540px) + 40px)) translateX(0) rotate(-20deg);
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

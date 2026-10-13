<script lang="ts">
  import { stampMotionAtStart } from '$lib/platform/reducedMotion';
  import { CONFETTI_PIECES as confetti } from '$lib/ai/confettiField';
</script>

<div class="confetti-layer" aria-hidden="true" use:stampMotionAtStart>
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
     as --confetti-rx/--confetti-ry, declared by the parent on .ai-stage from the
     dial's own geometry and the stage's declared box, so they hold from the
     first frame with no fallback to cover. */
  .confetti-layer {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
    overflow: hidden;
    --confetti-mask: radial-gradient(
      ellipse var(--confetti-rx) var(--confetti-ry) at 50% 50%,
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
    box-shadow: 0 1px 2px rgb(0 0 0 / 12%);
    animation: leafFall var(--duration) var(--delay) linear infinite;
    /* Fall-path stops as a fraction of --stage-h (the stage's declared height,
       set by the parent on .ai-stage) — derived from the original fixed-540px
       ladder's own proportions (110/540, 260/540, 410/540) so the fall keeps
       the same easing feel while spanning whatever height the stage renders
       at. */
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
      transform: translateY(calc(var(--stage-h) * var(--fall-25))) translateX(var(--sway))
        rotate(55deg);
    }
    50% {
      transform: translateY(calc(var(--stage-h) * var(--fall-50)))
        translateX(calc(var(--sway) * -1)) rotate(-40deg);
    }
    75% {
      transform: translateY(calc(var(--stage-h) * var(--fall-75))) translateX(var(--sway))
        rotate(65deg);
    }
    90% {
      opacity: 1;
    }
    100% {
      transform: translateY(calc(var(--stage-h) + 40px)) translateX(0) rotate(-20deg);
      opacity: 0;
    }
  }

  .confetti-layer:global([data-start-reduced-motion]) .confetti {
    animation: none;
    opacity: 0;
  }
</style>

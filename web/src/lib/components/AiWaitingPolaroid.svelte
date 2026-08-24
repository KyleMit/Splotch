<script lang="ts">
  import Icon from './Icon.svelte';
  import { aiResult, restoreAiResult } from '$lib/state/aiGeneration.svelte';
  import { aiProgress } from '$lib/state/aiProgress.svelte';

  // The picture-in-progress, pinned to the top-left of the canvas while the
  // child keeps drawing (ADR-0116, ADR-0117). A photo rather than a chip: what
  // is waiting is a picture, and a print that develops in the corner says so
  // without any reading. It is also deliberately the only way back — minimizing
  // must never be a way to lose a picture that is already being paid for.

  const waiting = $derived(aiResult.open && aiResult.minimized && aiResult.generating);
  const ready = $derived(aiResult.open && aiResult.minimized && !aiResult.generating);
  const failed = $derived(ready && !!aiResult.error);

  const label = $derived(
    waiting
      ? 'Your picture is being made — tap to watch'
      : failed
        ? "That didn't work — tap to see"
        : 'Your picture is ready — tap to see it'
  );

  // Whole percent, not the raw fraction: the bar is 90px wide and the run it
  // tracks is half a minute long, so a per-frame width would write a new style
  // sixty times a second — over the canvas the child is drawing on — to move it
  // by a hundredth of a pixel.
  const fillPercent = $derived(Math.round(aiProgress.value * 100));
</script>

{#if waiting || ready}
  <button
    class="ai-waiting-polaroid"
    class:ready
    class:failed
    type="button"
    aria-label={label}
    onclick={restoreAiResult}
  >
    <span class="polaroid-window">
      {#if ready && aiResult.resultUrl && !failed}
        <img src={aiResult.resultUrl} alt="" />
      {:else if aiResult.previewUrl}
        <img class="waiting-art" src={aiResult.previewUrl} alt="" />
      {/if}
      {#if waiting}<span class="polaroid-spinner"></span>{/if}
    </span>

    <span class="polaroid-caption">
      {#if waiting}
        <span class="progress-track">
          <span class="progress-fill" style:width="{fillPercent}%"></span>
        </span>
      {:else}
        <span class="caption-text">{failed ? 'Oh no' : 'Ready!'}</span>
      {/if}
    </span>

    {#if ready && !failed}<Icon name="wand-stars" class="polaroid-badge" />{/if}
  </button>
{/if}

<style>
  /* Top-left of the canvas, clear of the Color Palette beside it — near enough
     that the tilt and shadow graze the palette's edge, never far enough onto it
     to cover a color. It paints over that edge rather than being clipped under
     it, which is what --z-waiting-polaroid buys above --z-palette. */
  .ai-waiting-polaroid {
    --polaroid-width: 104px;
    --polaroid-photo-height: 68px;
    --polaroid-tilt: -5deg;
    --polaroid-clearance: 28px;
    /* Deeper than the inset this corner would otherwise take, because the print
       is not the topmost thing here: the ready wiggle lifts it another ~20px and
       the badge hangs above that again. Measured at the wiggle's peak — the
       badge cleared the screen by 4px at 21px of headroom, which is to say it
       didn't. */
    --polaroid-headroom: 30px;
    /* The quiet ink for a caption that isn't celebrating anything. Pinned, like
       everything else on this print: --polaroid-paper stays white at night, so
       what is written on it has to stay dark. */
    --polaroid-muted-ink: rgba(0, 0, 0, 0.55);

    position: fixed;
    top: calc(var(--polaroid-headroom) + var(--safe-area-top));
    left: calc(
      var(--palette-landscape-width) + var(--polaroid-clearance) + var(--safe-area-left)
    );
    z-index: var(--z-waiting-polaroid);
    width: var(--polaroid-width);
    padding: 7px 7px 8px;
    border: none;
    border-radius: 4px;
    background: var(--polaroid-paper);
    box-shadow:
      0 10px 24px rgba(0, 0, 0, 0.28),
      0 3px 8px rgba(0, 0, 0, 0.18);
    font-family: var(--font-family);
    cursor: pointer;
    transform: rotate(var(--polaroid-tilt));
    animation: polaroidIn 340ms var(--ease-pop);
  }

  /* The palette is a top bar here, so the same corner of the canvas is below it
     rather than beside it. */
  @media (orientation: portrait) {
    .ai-waiting-polaroid {
      top: calc(var(--palette-portrait-height) + 16px + var(--safe-area-top));
      left: calc(16px + var(--safe-area-left));
    }
  }

  /* Arrival: a pop and a wiggle, not a takeover (ADR-0116). Three passes is
     about five seconds of asking to be noticed, after which it rests — a child
     mid-stroke gets a picture waiting patiently, not one that nags. */
  .ai-waiting-polaroid.ready {
    animation: polaroidWiggle 1.65s 150ms ease-in-out 3;
  }

  /* One pass for a run that failed. The change still has to be noticed — the
     print is already on screen, so nothing else marks the moment — but three
     passes of delight over "Oh no" is the app celebrating a disappointment. */
  .ai-waiting-polaroid.ready.failed {
    animation-iteration-count: 1;
  }

  .polaroid-window {
    position: relative;
    display: grid;
    place-items: center;
    width: 100%;
    height: var(--polaroid-photo-height);
    border-radius: 2px;
    overflow: hidden;
    /* The window recessed into the print — ink on paper, so it holds whichever
       white the paper is. */
    background: rgba(0, 0, 0, 0.05);
  }

  .polaroid-window img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* The child's own drawing, dimmed and softened so the spinner reads on top of
     it and the picture still to come keeps its surprise. */
  .waiting-art {
    opacity: 0.5;
    filter: blur(1px) saturate(1.1);
  }

  .polaroid-spinner {
    position: absolute;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2.5px solid color-mix(in srgb, var(--brand) 25%, transparent);
    border-top-color: var(--brand);
    animation: polaroidSpin 900ms linear infinite;
  }

  /* The white band under the photo, which a polaroid has whether it says
     anything or not — one height for both states so the print doesn't resize
     under the picture when it lands. */
  .polaroid-caption {
    display: grid;
    place-items: center;
    height: 20px;
    margin-top: 6px;
  }

  .progress-track {
    width: 100%;
    height: 6px;
    border-radius: var(--radius-pill);
    background: rgba(0, 0, 0, 0.08);
    overflow: hidden;
  }

  .progress-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--brand), var(--brand-solid));
  }

  .caption-text {
    color: var(--polaroid-ink);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
  }

  .ai-waiting-polaroid.failed .caption-text {
    color: var(--polaroid-muted-ink);
  }

  /* Hangs off the corner of the print, the way a sticker would. */
  :global(.polaroid-badge) {
    position: absolute;
    top: -12px;
    right: -10px;
    width: 28px;
    height: 28px;
    animation: badgePop 0.5s var(--ease-pop);
  }

  @keyframes polaroidSpin {
    to {
      transform: rotate(1turn);
    }
  }

  @keyframes polaroidIn {
    0% {
      opacity: 0;
      transform: rotate(8deg) scale(0.5) translateY(-24px);
    }
    70% {
      opacity: 1;
      transform: rotate(-8deg) scale(1.06) translateY(0);
    }
    100% {
      transform: rotate(var(--polaroid-tilt)) scale(1) translateY(0);
    }
  }

  @keyframes polaroidWiggle {
    0%,
    100% {
      transform: rotate(var(--polaroid-tilt)) scale(1);
    }
    20% {
      transform: rotate(3deg) scale(1.09);
    }
    45% {
      transform: rotate(-10deg) scale(1.05);
    }
    70% {
      transform: rotate(-2deg) scale(1.07);
    }
  }

  @keyframes badgePop {
    0% {
      transform: scale(0) rotate(-30deg);
    }
    70% {
      transform: scale(1.3) rotate(6deg);
    }
    100% {
      transform: scale(1) rotate(0);
    }
  }

  /* A toddler app that moves things unprompted has to honour this one. The
     spinner slows rather than stopping: it is the only sign left that anything
     is still happening. */
  @media (prefers-reduced-motion: reduce) {
    .ai-waiting-polaroid,
    .ai-waiting-polaroid.ready,
    :global(.polaroid-badge) {
      animation: none;
    }
    .polaroid-spinner {
      animation-duration: 2.4s;
    }
  }
</style>

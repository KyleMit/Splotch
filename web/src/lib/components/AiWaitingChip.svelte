<script lang="ts">
  import Icon from './Icon.svelte';
  import { aiResult, restoreAiResult } from '$lib/state/aiGeneration.svelte';

  // The corner the waiting picture sits in while the child keeps drawing
  // (ADR-0116). It is deliberately the only way back: minimizing must never be
  // a way to lose a picture that is already being paid for.

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
</script>

{#if waiting || ready}
  <button
    class="ai-waiting-chip"
    class:ready
    class:failed
    type="button"
    aria-label={label}
    onclick={restoreAiResult}
  >
    <span class="chip-art">
      {#if ready && aiResult.resultUrl && !failed}
        <img src={aiResult.resultUrl} alt="" />
      {:else if aiResult.previewUrl}
        <img class="waiting-art" src={aiResult.previewUrl} alt="" />
      {/if}
      {#if waiting}<span class="chip-spinner"></span>{/if}
      {#if ready && !failed}<Icon name="wand-stars" class="chip-badge" />{/if}
    </span>
    <span class="chip-text">{waiting ? 'Making…' : failed ? 'Oh no' : 'Ready!'}</span>
  </button>
{/if}

<style>
  /* Above the action drawer (--z-panel) so it is never occluded by the chrome it
     sits beside, and clear of the Settings Button in the corner below it. */
  .ai-waiting-chip {
    position: fixed;
    right: max(16px, env(safe-area-inset-right));
    bottom: calc(max(16px, env(safe-area-inset-bottom)) + 76px);
    z-index: var(--z-banner);
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px 8px 8px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--text-strong);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    box-shadow: var(--shadow-control);
    cursor: pointer;
    animation: chip-in 260ms var(--ease-pop);
  }

  .ai-waiting-chip.ready {
    border-color: var(--brand);
    /* The "springs back up" moment: it arrives, then keeps a soft pulse so a
       child who is mid-drawing still finds it a few seconds later. */
    animation:
      chip-pop 420ms var(--ease-pop),
      chip-pulse 2.2s 420ms ease-in-out 3;
  }

  .ai-waiting-chip.failed {
    border-color: var(--border);
  }

  .chip-art {
    position: relative;
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    overflow: hidden;
    background: var(--surface-hover);
    flex-shrink: 0;
  }

  .chip-art img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* The child's own drawing, dimmed so the spinner reads on top of it. */
  .waiting-art {
    opacity: 0.45;
    filter: blur(1px);
  }

  .chip-spinner {
    position: absolute;
    inset: 3px;
    border-radius: 50%;
    border: 2.5px solid color-mix(in srgb, var(--brand) 25%, transparent);
    border-top-color: var(--brand);
    animation: chip-spin 900ms linear infinite;
  }

  :global(.chip-badge) {
    position: absolute;
    width: 20px;
    height: 20px;
  }

  @keyframes chip-spin {
    to {
      transform: rotate(1turn);
    }
  }

  @keyframes chip-in {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.9);
    }
  }

  @keyframes chip-pop {
    from {
      transform: scale(0.82);
    }
    60% {
      transform: scale(1.12);
    }
    to {
      transform: scale(1);
    }
  }

  /* Both keyframes name a token that resolves, or the whole animation computes
     to `none` and the chip's one way of catching a busy child's eye does
     nothing at all. */
  @keyframes chip-pulse {
    0%,
    100% {
      box-shadow: var(--shadow-control);
    }
    50% {
      box-shadow:
        var(--shadow-pop),
        0 0 0 6px color-mix(in srgb, var(--brand) 22%, transparent);
    }
  }

  /* A toddler app that moves things unprompted has to honour this one. */
  @media (prefers-reduced-motion: reduce) {
    .ai-waiting-chip,
    .ai-waiting-chip.ready {
      animation: none;
    }
    .chip-spinner {
      animation-duration: 2.4s;
    }
  }
</style>

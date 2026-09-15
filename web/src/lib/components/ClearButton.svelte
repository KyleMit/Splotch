<script lang="ts">
  import { untrack } from 'svelte';
  import Icon from './Icon.svelte';
  import ClearCoachmark from './ClearCoachmark.svelte';
  import ClearRing from './ClearRing.svelte';
  import { clearCanvas } from '$lib/drawing/engine';
  import { saveDrawingIfEnabled } from '$lib/drawing/saveOnDelete';
  import { dragToClear } from '$lib/actions/dragToClear';
  import { scribbleGuard } from '$lib/actions/scribbleGuard';
  import type { Orientation } from '$lib/platform';
  import { layoutState } from '$lib/state/layout.svelte';
  import { resetToolAfterClear } from '$lib/state/tool.svelte';

  let containerEl: HTMLDivElement;
  let buttonEl: HTMLButtonElement;
  let acceptZoneEl: HTMLDivElement;
  let clearPreviewEl: HTMLDivElement;
  let coachmark: ClearCoachmark;

  // Untracked latch — read imperatively by resetButtonPosition to skip a reset mid-gesture.
  let isDragging = false;

  function resetButtonPosition(_orientation: Orientation) {
    coachmark?.dismiss(); // geometry would be stale after a layout change
    if (!containerEl || isDragging) return;
    containerEl.style.transform = '';
  }

  // Send the button home when the orientation flips (its docked corner moved);
  // plain same-orientation resizes leave a mid-drag or settled position alone.
  // untrack the reset so this fires only on an orientation change — the dismiss
  // it calls reads the coachmark's visibility state, and subscribing to that
  // would re-run this effect on reveal and instantly dismiss the tutorial.
  $effect(() => {
    const orientation = layoutState.orientation;
    untrack(() => resetButtonPosition(orientation));
  });
</script>

<div class="clear-container" id="clearContainer" bind:this={containerEl}>
  <!-- scribbleGuard cancels a stylus tap's touch stream so it can't arm iPadOS
       Scribble against the next stroke (ADR-0038) — a pen tap here that starts
       no drag is exactly the arming gesture, and the swallowed stroke that
       follows is invisible. No companion scribbleTap: its pointerup activation
       would bypass the drag, while dragToClear accepts only detail-zero clicks;
       the stylus click suppressed here has detail >= 1 and is intentionally ignored. -->
  <button
    class="clear-button"
    id="clearButton"
    aria-label="Clear drawing"
    bind:this={buttonEl}
    use:scribbleGuard
    use:dragToClear={() => ({
      containerEl,
      acceptZoneEl,
      clearPreviewEl,
      onClear: (home) => {
        // Fire-and-forget: the save must not delay the clear. Its export
        // snapshot is taken synchronously inside this call, before clearCanvas
        // wipes the paper (see saveOnDelete.ts). The catch covers the save
        // pipeline's on-demand chunk failing to load on a dead connection —
        // the clear itself must never be blocked by that.
        saveDrawingIfEnabled().catch((err) => console.error('Save on delete failed:', err));
        clearCanvas({ animateInto: home });
        resetToolAfterClear();
      },
      onTutorialShow: () => coachmark?.show(buttonEl),
      onTutorialDismiss: () => coachmark?.dismiss(),
      onDragStart: () => {
        isDragging = true;
      },
      onDragEnd: () => {
        isDragging = false;
      },
    })}
  >
    <!-- Both lids render; the .dragging class (added imperatively by the
         dragToClear action) decides which is shown — see the CSS below. -->
    <Icon name="trash-closed" class="clear-icon clear-icon-closed" aria-hidden="true" />
    <Icon name="trash-open" class="clear-icon clear-icon-open" aria-hidden="true" />
  </button>
</div>

<div class="clear-accept-zone" id="clearAcceptZone" bind:this={acceptZoneEl} aria-hidden="true">
  <ClearRing />
</div>

<!-- Radial paper wash: emanates from the button's home corner and grows with
     drag progress, previewing the clear before the user commits to it. -->
<div class="clear-preview" bind:this={clearPreviewEl} aria-hidden="true"></div>

<ClearCoachmark bind:this={coachmark} />
}

<style>
  .clear-container {
    position: fixed;
    top: calc(20px + var(--safe-area-top));
    right: calc(-10px + var(--safe-area-right));
    z-index: var(--z-clear-button);
    pointer-events: none; /* Allow clicks through container to children */
    transition: transform 480ms var(--ease-pop);
  }

  /* While the finger is in control, snap to position with no easing.
     :global() — the .dragging-active class is added imperatively via classList. */
  .clear-container:global(.dragging-active) {
    transition: none;
  }

  /* Alarm red for the delete-ready glow (.clear-button) and the accept-zone
     threshold (.clear-accept-zone) below — declared once on the group since
     .clear-button (a child of .clear-container) and .clear-accept-zone (that
     container's sibling) share no single non-root ancestor to hang it on. */
  .clear-button,
  .clear-accept-zone {
    --alarm-rgb: 255 56 56;
  }

  .clear-button {
    position: relative;
    width: 70px;
    height: 70px;
    background: var(--clear-gradient-rest);
    border: none;
    border-radius: 50% 0 0 50%;
    box-shadow: -4px 4px 20px rgb(0 0 0 / 30%);
    cursor: grab;
    touch-action: none;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      box-shadow var(--duration-base) ease,
      border-radius 0.3s ease,
      transform var(--duration-base) ease,
      background var(--duration-base) ease;
    pointer-events: auto; /* Button is clickable */
  }

  .clear-button:active {
    cursor: grabbing;
  }

  /* Dragging: morph from half-circle pinned shape to a full circle.
     .dragging is added imperatively via classList. */
  .clear-button:global(.dragging) {
    border-radius: 50%;
    box-shadow: -6px 6px 30px rgb(0 0 0 / 40%);
    animation: clear-lift-off 180ms var(--ease-pop);
  }

  /* A quick squash as the button leaves its docked corner, then back to round. */
  @keyframes clear-lift-off {
    50% {
      transform: scale(1.07, 0.93);
    }
  }

  .clear-button:global(.dragging) :global(.clear-icon) {
    margin-right: 0;
  }

  /* Closed lid at rest, open lid while dragging — driven entirely by the same
     .dragging class that morphs the button from docked to round. Scoped under
     .clear-button so these out-specify Icon.svelte's scoped `span` rule. */
  .clear-button :global(.clear-icon-open) {
    display: none;
  }

  .clear-button:global(.dragging) :global(.clear-icon-closed) {
    display: none;
  }

  .clear-button:global(.dragging) :global(.clear-icon-open) {
    display: block;
  }

  /* .clearing is added imperatively by dragToClear while the departing page is
     still in flight. */
  .clear-button:global(.clearing) {
    pointer-events: none;
  }

  .clear-button:global(.delete-ready) {
    background: linear-gradient(135deg, rgb(var(--alarm-rgb)), #d63031);
    transform: scale(1.1);
    box-shadow: 0 6px 40px rgb(var(--alarm-rgb) / 60%);
  }

  :global(.clear-icon) {
    width: 40px;
    height: 40px;
    display: block;
    pointer-events: none;
    margin-right: 2px;
    transition: margin var(--duration-slow) ease;
  }

  /* Clear Accept Zone — radial ring around the button's home position
     that highlights where to drag to confirm a clear. */
  .clear-accept-zone {
    position: fixed;
    pointer-events: none;
    display: none;
    z-index: var(--z-clear-accept-zone); /* Below .clear-container so the button sits on top */
    border-radius: 50%;
    color: rgb(var(--alarm-rgb) / 45%);
    background: radial-gradient(
      circle,
      rgb(var(--alarm-rgb) / 0%) 55%,
      rgb(var(--alarm-rgb) / 6%) 100%
    );
    box-sizing: border-box;
    opacity: 0;
    transform: scale(0.85);
    transition:
      opacity var(--duration-base) ease,
      transform 0.3s var(--ease-pop),
      color var(--duration-fast) ease,
      background var(--duration-fast) ease;
  }

  /* .visible / .threshold-reached are toggled imperatively via classList. */
  .clear-accept-zone:global(.visible) {
    opacity: 1;
    transform: scale(1);
  }

  .clear-accept-zone:global(.threshold-reached) {
    color: rgb(var(--alarm-rgb) / 90%);
    --clear-ring-dashes: 0;
    --clear-ring-solid: 1;
    background: radial-gradient(
      circle,
      rgb(var(--alarm-rgb) / 0%) 50%,
      rgb(var(--alarm-rgb) / 22%) 100%
    );
  }

  /* Radial paper wash previewing the clear mid-drag. A paper-colored
     gradient anchored at the button's home corner (top-right) that both grows
     and strengthens as --clear-progress climbs 0→1. The theme's paper, not
     white, so it reads as "returning to blank canvas," and anchored on the
     corner the departing page flies into so the preview and the commit feel
     continuous.
     Each color-mix is preceded by its light-paper rgb fallback for
     pre-color-mix engines (docs/COMPATIBILITY.md). */
  .clear-preview {
    position: fixed;
    inset: 0;
    z-index: var(--z-clear-preview); /* above the canvas, below the departing page */
    pointer-events: none;
    opacity: var(--clear-progress, 0);
    background: radial-gradient(
      circle at 100% 0,
      rgb(252 251 248 / 90%),
      rgb(252 251 248 / 0%) calc(var(--clear-progress, 0) * 130%)
    );
    background: radial-gradient(
      circle at 100% 0,
      color-mix(in srgb, var(--paper) 90%, transparent),
      color-mix(in srgb, var(--paper) 0%, transparent) calc(var(--clear-progress, 0) * 130%)
    );
    transition:
      opacity 0.12s linear,
      background 0.12s linear;
    will-change: opacity;
  }

  /* Point of no return: the wash snaps to flood the whole canvas, giving the
     threshold a distinct climax instead of a featureless ramp. On commit
     (.releasing) the flood keeps its fill while it fades out, since a gradient
     cannot transition. */
  .clear-preview:global(.committed),
  .clear-preview:global(.releasing) {
    opacity: 0.92;
    background: radial-gradient(
      circle at 100% 0,
      rgb(252 251 248 / 95%),
      rgb(252 251 248 / 82%) 140%
    );
    background: radial-gradient(
      circle at 100% 0,
      color-mix(in srgb, var(--paper) 95%, transparent),
      color-mix(in srgb, var(--paper) 82%, transparent) 140%
    );
    transition:
      opacity 0.18s ease,
      background 0.18s ease;
  }

  .clear-preview:global(.releasing) {
    opacity: 0;
    transition: opacity 280ms linear;
  }

  @media (prefers-reduced-motion: reduce) {
    /* Keep the wash (it conveys state, not just motion) but make it instant. */
    .clear-accept-zone,
    .clear-preview,
    .clear-preview:global(.releasing) {
      transition: none;
    }

    .clear-button:global(.dragging) {
      animation: none;
    }
  }

  @media (orientation: portrait) {
    .clear-container {
      top: calc(90px + var(--safe-area-top));
    }

    .clear-button {
      width: 60px;
      height: 60px;
    }

    :global(.clear-icon) {
      width: 38px;
      height: 38px;
      margin-right: 2px;
    }
  }
</style>

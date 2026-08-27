<!--
  THROWAWAY tuning slider for perOpGlazeReturn (ADR-0148), on the real HUD so the
  value can be judged while actually drawing on the device — the sweep sheet
  (npm run gen:crayon-glaze-sheet) compares values, this one answers how they
  FEEL under a finger, which is the half a static grid cannot show.

  Not for merge. It is gated to dev-harness builds, which is what perf:build:cap
  produces and what a shipped app never is.

  Moving the slider repaints the retained ops, so the strokes already on the
  paper re-render at the new value instead of only affecting the next one — the
  whole drawing becomes the comparison.
-->
<script lang="ts">
  import { browser, dev } from '$app/environment';
  import { getCrayonOptions, setCrayonOptions } from '$lib/drawing/crayonBrush';
  import { setCrayonParams } from '$lib/drawing/engine';

  // `browser` FIRST, and the short-circuit is load-bearing: __DEV_HARNESS__ is a
  // client seam that the server build does not substitute, so evaluating it here
  // throws during SSR — and the native build prerenders, so it would take
  // `build:cap` down too. Same guard shape as lib/storeCapture.ts.
  const SHOWN = browser && (dev || __DEV_HARNESS__);
  // Above the shipped 0.1 so the useless end of the range is reachable, and the
  // reader can see 0.45 (the pass-cadence figure) is where mixing disappears.
  const MAX_RETURN = 0.5;

  let value = $state(SHOWN ? getCrayonOptions().perOpGlazeReturn : 0);
  let open = $state(false);

  function apply(next: number) {
    value = next;
    // Goes through the dev A/B seam, which also repaints the retained ops.
    setCrayonParams({ perOpGlazeReturn: next });
    // setCrayonParams is a no-op outside a dev-harness build; keep the module
    // state honest anyway so the readout cannot disagree with the renderer.
    setCrayonOptions({ perOpGlazeReturn: next });
  }
</script>

{#if SHOWN}
  <div class="glaze-tuner" class:open>
    <button type="button" onclick={() => (open = !open)} aria-label="Crayon glaze tuner">
      glaze {value.toFixed(2)}
    </button>
    {#if open}
      <input
        type="range"
        min="0"
        max={MAX_RETURN}
        step="0.01"
        aria-label="Per-op glaze return"
        bind:value
        oninput={(event) => apply(Number(event.currentTarget.value))}
      />
    {/if}
  </div>
{/if}

<style>
  /* Fixed, and above the canvas: the engine binds pointer handlers to the
     canvas, so an overlay that sits outside it cannot start a stroke. */
  /* Mid-right: the top-right corner is the Clear button and the iOS status bar,
     the bottom corners are the Actions Panel and the Settings Button. */
  .glaze-tuner {
    position: fixed;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 8px;
    background: rgb(0 0 0 / 0.55);
    font: 600 13px system-ui;
    color: white;
    touch-action: none;
  }
  .glaze-tuner button {
    all: unset;
    cursor: pointer;
    padding: 4px 6px;
    font-variant-numeric: tabular-nums;
  }
  .glaze-tuner input {
    width: 190px;
  }
</style>

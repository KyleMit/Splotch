<script lang="ts">
  import Icon from './Icon.svelte';
  import { scribbleTap } from '$lib/actions/scribbleGuard';
  import { replayActionUnavailableFeedback } from '$lib/actionUnavailableFeedback';
  import { undo } from '$lib/drawing/engine';
  import { prefersReducedMotion } from '$lib/platform/reducedMotion';
  import { canvasState } from '$lib/state/canvas.svelte';

  // Intentionally untracked: read only by the imperative tap handler.
  let undoBtnEl: HTMLButtonElement | undefined;

  function handleUndoClick() {
    if (canvasState.canUndo) {
      undo(undoBtnEl);
      return;
    }
    replayActionUnavailableFeedback(undoBtnEl);
  }
</script>

<!-- aria-disabled (not the disabled attribute) so the button still
     receives taps at the end of history and can answer with the
     unavailable cue; handleUndoClick guards the actual undo. -->
<button
  class="action-button"
  class:disabled={!canvasState.canUndo}
  id="undoButton"
  style:--i="5"
  aria-label="Undo"
  aria-disabled={!canvasState.canUndo}
  use:scribbleTap={handleUndoClick}
  bind:this={undoBtnEl}
>
  {#key canvasState.undoCount}
    {@const undoStartedReduced = prefersReducedMotion()}
    <Icon
      name="undo"
      class={canvasState.undoCount > 0 ? 'action-icon undo-firing' : 'action-icon'}
      data-start-reduced-motion={undoStartedReduced ? '' : undefined}
    />
  {/key}
</button>

<style>
  :global(html[data-off-undo] .actions-panel:not([data-action-panel-live])) #undoButton,
  :global(.actions-panel[data-action-panel-live][data-off-undo]) #undoButton {
    display: none;
  }
</style>

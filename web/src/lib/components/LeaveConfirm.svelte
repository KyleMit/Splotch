<script lang="ts">
  import Button from './design/Button.svelte';
  import { modalDialog, waitForDialogRetirement } from '$lib/actions/modalDialog.svelte';
  import { leaveApp, leaveConfirmModal } from '$lib/state/leaveConfirm';

  let dialogEl: HTMLDialogElement;

  // Leaving moves Splotch behind the home screen without closing it, so the drawing is still
  // there on return. Android can still close a background app, and drawings are not saved
  // across a close (issue 1450), so the copy promises only what holds.
  //
  // The dialog retires before the app leaves: a card still on screen would be the first thing
  // the child sees on return.
  async function leave() {
    leaveConfirmModal.hide();
    await waitForDialogRetirement(dialogEl);
    await leaveApp();
  }
</script>

<!-- Keep drawing comes first so showModal() focuses the choice that stays: a stray Enter or
     a switch-access press never leaves. -->
<dialog
  bind:this={dialogEl}
  class="leave-confirm confirm-card modal-dialog modal-fly-in modal-shell"
  aria-labelledby="leaveConfirmTitle"
  aria-describedby="leaveConfirmCopy"
  use:modalDialog={() => ({
    open: leaveConfirmModal.open,
    onRequestClose: leaveConfirmModal.hide,
  })}
>
  <div class="confirm-card-content">
    <div class="confirm-card-heading">
      <h2 id="leaveConfirmTitle">Leave Splotch?</h2>
      <p id="leaveConfirmCopy">
        This drawing stays while Splotch is in the background. It is lost if Splotch closes.
      </p>
    </div>

    <div class="leave-confirm-actions">
      <Button variant="brand" size="lg" onclick={leaveConfirmModal.hide}>Keep drawing</Button>
      <Button size="lg" onclick={() => void leave()}>Leave</Button>
    </div>
  </div>
</dialog>

<style>
  /* Wraps to a column on the narrowest phones rather than truncating either label. */
  .leave-confirm-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .leave-confirm-actions :global(.btn) {
    flex: 1 1 140px;
  }
</style>

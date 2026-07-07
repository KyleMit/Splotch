<script lang="ts">
  import Icon from './Icon.svelte';
  import { ui, closeParentCenter } from '$lib/state/ui.svelte';
  import { modalDialog } from '$lib/actions/modalDialog.svelte';
  import ParentCenterContent from './ParentCenterContent.svelte';
</script>

<!-- Thin modal shell around ParentCenterContent (the tabbed settings card), so
     the /components catalog can render the content without the dialog. -->
<dialog
  class="parent-help-modal modal-dialog modal-fly-in modal-shell"
  class:resizing={ui.resizingActionButtons}
  id="parentHelpModal"
  use:modalDialog={() => ({
    open: ui.parentCenterOpen,
    origin: ui.parentCenterOrigin,
    onRequestClose: closeParentCenter,
  })}
>
  <button class="parent-help-close modal-close-btn" aria-label="Close" onclick={closeParentCenter}>
    <Icon name="close" class="modal-close-icon" />
  </button>
  <ParentCenterContent />
</dialog>

<style>
  .parent-help-modal {
    max-width: 500px;
    width: 90%;
    max-height: 80vh;
    overflow: hidden;
  }

  .parent-help-close {
    z-index: 1;
  }

  /* While the parent drags the Button Size slider, the modal melts away to just
     that slider so the action buttons resize in full view behind it. The slider
     keeps its on-screen position (it stays under the finger); everything else in
     the card — heading, tabs, other settings — is hidden, and the card surface
     and backdrop go transparent so the canvas and buttons show through. The
     slider still occupies its normal slot in the (now invisible) layout, so no
     repositioning gymnastics are needed. */
  .parent-help-modal.resizing {
    background: transparent;
    box-shadow: none;
  }

  .parent-help-modal.resizing::backdrop {
    background: transparent;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .parent-help-modal.resizing :global(.parent-help-content),
  .parent-help-modal.resizing .parent-help-close {
    visibility: hidden;
  }

  .parent-help-modal.resizing :global(.button-size-setting) {
    visibility: visible;
    background: #fff;
    border-radius: 16px;
    /* A tight, even lift that hugs the rounded card — not the heavy, downward
       shadow that bled into a rectangular band below the control. */
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.16);
  }
</style>

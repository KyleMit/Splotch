<script lang="ts">
  import Icon from './Icon.svelte';
  import { ui, closeColoringBook } from '$lib/state/ui.svelte';
  import { modalDialog } from '$lib/actions/modalDialog.svelte';
  import ColoringBookContent from './ColoringBookContent.svelte';
</script>

<!-- Thin modal shell around ColoringBookContent (the book/page grids), so the
     /components catalog can render the content without the dialog. -->
<dialog
  class="coloring-book-modal modal-dialog modal-fly-in modal-shell"
  id="coloring-book-dialog"
  use:modalDialog={() => ({
    open: ui.coloringBookOpen,
    origin: ui.coloringBookOrigin,
    onRequestClose: closeColoringBook,
  })}
>
  <button
    class="coloring-book-close modal-close-btn"
    aria-label="Close"
    onclick={closeColoringBook}
  >
    <Icon name="close" class="modal-close-icon" />
  </button>

  <!-- Remount per open/close so the picker always starts back on the book grid
      with hover unarmed (this replaces the old onOpen/onClose goToBooks reset). -->
  {#key ui.coloringBookOpen}
    <ColoringBookContent />
  {/key}
</dialog>

<style>
  .coloring-book-modal {
    max-width: min(920px, calc(100vw - 32px));
    width: 90%;
    max-height: 85vh;
    overflow-y: auto;
  }

  .coloring-book-close {
    transition: opacity 0.2s ease;
    z-index: 1;
  }
</style>

<script lang="ts">
  import { ui, closeColorPicker } from '$lib/state/ui.svelte';
  import { modalDialog } from '$lib/actions/modalDialog.svelte';
  import { scribbleGuard } from '$lib/actions/scribbleGuard';
  import ColorPickerContent from './ColorPickerContent.svelte';
</script>

<!-- Thin modal shell around ColorPickerContent (the hexagon grid + drag logic),
     so the /components catalog can render the content without the dialog.
     scribbleGuard covers the hexagons AND the backdrop (backdrop events target
     the <dialog> itself): a pen tap that picks a color or dismisses the picker
     must not arm Scribble against the stroke that follows. Selection is
     pointerup-driven and backdrop dismissal is pointerdown-driven, so
     suppressing the stylus click synthesis costs nothing here. -->
<dialog
  id="color-picker"
  class="color-picker modal-dialog modal-fly-in"
  use:scribbleGuard
  use:modalDialog={() => ({
    open: ui.colorPickerOpen,
    origin: ui.colorPickerOrigin,
    onRequestClose: closeColorPicker,
  })}
>
  <!-- Remount per open/close so a drag interrupted by dismissal never leaves
      stale hover state behind (this replaces the old onClose reset). -->
  {#key ui.colorPickerOpen}
    <ColorPickerContent />
  {/key}
</dialog>

<style>
  .color-picker {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    margin: 0;
    background: white;
    border: none;
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    width: fit-content;
    max-width: 90vw;
    max-height: 90vh;
    overflow: hidden;
    padding: 0;
    touch-action: none;
  }
</style>

<script lang="ts">
  import ColorPickerContent from '$lib/components/ColorPickerContent.svelte';
</script>

<!-- Embedded by the /components catalog inside a resizable <iframe>: the
     picker's trim ladders are viewport media queries (its room in the app is
     the whole screen, via the dialog's 90vw/90vh caps), so giving it its own
     viewport is what lets the catalog resize it live. -->
<svelte:head>
  <title>Color Picker frame · Splotch</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="frame">
  <div class="picker-card">
    <ColorPickerContent />
  </div>
</div>

<style>
  /* Mimic the dialog treatment: dimmed backdrop, centered white card capped at
     90vw/90vh like `.color-picker` in ColorPicker.svelte. */
  .frame {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6);
  }

  .picker-card {
    background: white;
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    width: fit-content;
    max-width: 90vw;
    max-height: 90vh;
    overflow: hidden;
  }
</style>

<script lang="ts">
  import Icon from './Icon.svelte';
  import { fullscreen, toggleFullscreen } from '$lib/state/fullscreen.svelte';
</script>

{#if fullscreen.supported}
  <button
    class="fullscreen-toggle corner-button"
    aria-label={fullscreen.active ? 'Exit fullscreen' : 'Enter fullscreen'}
    aria-pressed={fullscreen.active}
    onclick={toggleFullscreen}
  >
    <Icon
      name={fullscreen.active ? 'fullscreen-exit' : 'fullscreen'}
      class="corner-button-icon"
      role="img"
    />
  </button>
{/if}

<style>
  /* Corner-button chrome comes from .corner-button in app.css. Anchored
     to the top-left of the drawing area (its parent .canvas-container), so it
     clears the Color Palette in both orientations without knowing its size —
     the palette sits above the canvas in portrait and beside it in landscape.
     Safe-area insets are already applied by .app-container, so none here. */
  .fullscreen-toggle {
    position: absolute;
    top: 8px;
    left: 8px;
    width: 44px;
    height: 44px;
    z-index: 4;
  }
</style>

<script lang="ts">
  import Icon from './Icon.svelte';
  import { fullscreen, toggleFullscreen } from '$lib/state/fullscreen.svelte';
</script>

{#if fullscreen.supported}
  <button
    class="fullscreen-toggle"
    aria-label={fullscreen.active ? 'Exit fullscreen' : 'Enter fullscreen'}
    aria-pressed={fullscreen.active}
    onclick={toggleFullscreen}
  >
    <Icon
      name={fullscreen.active ? 'fullscreen-exit' : 'fullscreen'}
      class="fullscreen-toggle-icon"
      role="img"
    />
  </button>
{/if}

<style>
  /* Subtle, low-opacity gray control in the Parent Help Button idiom. Anchored
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
    background: transparent;
    border: none;
    cursor: pointer;
    opacity: 0.4;
    transition: opacity 0.2s ease;
    z-index: 4;
    padding: 8px;
    touch-action: manipulation;
  }

  @media (hover: hover) {
    .fullscreen-toggle:hover {
      opacity: 0.7;
    }
  }

  .fullscreen-toggle:active {
    opacity: 1;
  }

  :global(.fullscreen-toggle-icon) {
    width: 100%;
    height: 100%;
    filter: invert(60%) grayscale(100%);
  }

  @media (hover: hover) {
    .fullscreen-toggle:hover :global(.fullscreen-toggle-icon) {
      filter: invert(40%) grayscale(100%);
    }
  }

  .fullscreen-toggle:active :global(.fullscreen-toggle-icon) {
    filter: invert(0%) grayscale(100%);
  }
</style>

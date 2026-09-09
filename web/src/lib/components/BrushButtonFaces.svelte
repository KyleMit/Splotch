<script lang="ts">
  import { BRUSH_OPTIONS, type BrushType } from '$lib/state/tool.svelte';
  import Icon from './Icon.svelte';
  let { faceRoll }: { faceRoll: { brush: BrushType } | null } = $props();
</script>

{#key faceRoll}
  <span class="brush-button-faces" class:entering={faceRoll !== null}>
    {#each BRUSH_OPTIONS as opt (opt.brush)}
      <Icon name={opt.icon} class="action-icon" data-brush-face={opt.brush} />
    {/each}
  </span>
{/key}

<style>
  .brush-button-faces {
    display: flex;
    width: 100%;
    height: 100%;
  }

  .brush-button-faces.entering {
    animation: face-roll var(--duration-slow) var(--ease-pop) backwards;
    transform-origin: center;
  }

  @keyframes face-roll {
    from {
      opacity: 0;
      transform: rotate(-120deg) scale(0.4);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .brush-button-faces.entering {
      animation: none;
    }
  }

  .brush-button-faces :global(.action-icon[data-brush-face]) {
    display: none;
  }

  :global(html[data-single-brush='crayon'])
    :global(.actions-panel:not([data-action-panel-live]))
    .brush-button-faces
    :global(.action-icon[data-brush-face='crayon']),
  :global(html[data-single-brush='magic'])
    :global(.actions-panel:not([data-action-panel-live]))
    .brush-button-faces
    :global(.action-icon[data-brush-face='magic']),
  :global(html[data-single-brush='eraser'])
    :global(.actions-panel:not([data-action-panel-live]))
    .brush-button-faces
    :global(.action-icon[data-brush-face='eraser']),
  :global(html:not([data-single-brush]):not([data-brush]))
    :global(.actions-panel:not([data-action-panel-live]))
    .brush-button-faces
    :global(.action-icon[data-brush-face='pen']),
  :global(html:not([data-single-brush])[data-brush='crayon'])
    :global(.actions-panel:not([data-action-panel-live]))
    .brush-button-faces
    :global(.action-icon[data-brush-face='crayon']),
  :global(html:not([data-single-brush])[data-brush='magic'])
    :global(.actions-panel:not([data-action-panel-live]))
    .brush-button-faces
    :global(.action-icon[data-brush-face='magic']),
  :global(html:not([data-single-brush])[data-brush='eraser'])
    :global(.actions-panel:not([data-action-panel-live]))
    .brush-button-faces
    :global(.action-icon[data-brush-face='eraser']),
  :global(.actions-panel[data-action-panel-live][data-single-brush='crayon'])
    .brush-button-faces
    :global(.action-icon[data-brush-face='crayon']),
  :global(.actions-panel[data-action-panel-live][data-single-brush='magic'])
    .brush-button-faces
    :global(.action-icon[data-brush-face='magic']),
  :global(.actions-panel[data-action-panel-live][data-single-brush='eraser'])
    .brush-button-faces
    :global(.action-icon[data-brush-face='eraser']),
  :global(.actions-panel[data-action-panel-live]:not([data-single-brush]):not([data-brush]))
    .brush-button-faces
    :global(.action-icon[data-brush-face='pen']),
  :global(.actions-panel[data-action-panel-live]:not([data-single-brush])[data-brush='crayon'])
    .brush-button-faces
    :global(.action-icon[data-brush-face='crayon']),
  :global(.actions-panel[data-action-panel-live]:not([data-single-brush])[data-brush='magic'])
    .brush-button-faces
    :global(.action-icon[data-brush-face='magic']),
  :global(.actions-panel[data-action-panel-live]:not([data-single-brush])[data-brush='eraser'])
    .brush-button-faces
    :global(.action-icon[data-brush-face='eraser']) {
    display: inline-flex;
  }
</style>

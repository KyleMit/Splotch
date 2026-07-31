<script lang="ts">
  import { BRUSH_OPTIONS } from '$lib/state/tool.svelte';
  import Icon from './Icon.svelte';
</script>

<span class="brush-button-faces">
  {#each BRUSH_OPTIONS as opt (opt.brush)}
    <Icon name={opt.icon} class="action-icon" data-brush-face={opt.brush} />
  {/each}
</span>

<style>
  .brush-button-faces {
    display: contents;
  }

  .brush-button-faces :global(.action-icon[data-brush-face]) {
    display: none;
  }

  :global(html:not([data-brush]))
    :global(.actions-panel:not([data-action-panel-live]))
    .brush-button-faces
    :global(.action-icon[data-brush-face='pen']),
  :global(html[data-brush='crayon'])
    :global(.actions-panel:not([data-action-panel-live]))
    .brush-button-faces
    :global(.action-icon[data-brush-face='crayon']),
  :global(html[data-brush='magic'])
    :global(.actions-panel:not([data-action-panel-live]))
    .brush-button-faces
    :global(.action-icon[data-brush-face='magic']),
  :global(html[data-brush='eraser'])
    :global(.actions-panel:not([data-action-panel-live]))
    .brush-button-faces
    :global(.action-icon[data-brush-face='eraser']),
  :global(.actions-panel[data-action-panel-live]:not([data-brush]))
    .brush-button-faces
    :global(.action-icon[data-brush-face='pen']),
  :global(.actions-panel[data-action-panel-live][data-brush='crayon'])
    .brush-button-faces
    :global(.action-icon[data-brush-face='crayon']),
  :global(.actions-panel[data-action-panel-live][data-brush='magic'])
    .brush-button-faces
    :global(.action-icon[data-brush-face='magic']),
  :global(.actions-panel[data-action-panel-live][data-brush='eraser'])
    .brush-button-faces
    :global(.action-icon[data-brush-face='eraser']) {
    display: inline-flex;
  }
</style>

<script lang="ts">
  import { BRUSH_OPTIONS, type BrushType } from '$lib/state/tool.svelte';
  import Icon from './Icon.svelte';
  import { stampMotionAtStart } from '$lib/platform/reducedMotion';
  let { faceRoll }: { faceRoll: { brush: BrushType } | null } = $props();
</script>

{#key faceRoll}
  <span class="brush-button-faces" class:entering={faceRoll !== null} use:stampMotionAtStart>
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
    animation: face-roll 460ms var(--ease-pop) backwards;
    transform-origin: center;
  }

  /* Small enough a turn that the tool the child just picked is recognisable from
     the first frame: it drops into the slot rather than tumbling into it. */
  @keyframes face-roll {
    0% {
      opacity: 0;
      transform: rotate(-54deg) scale(0.62);
    }
    56% {
      opacity: 1;
      transform: rotate(7deg) scale(1.045);
    }
    80% {
      transform: rotate(-2.5deg) scale(0.99);
    }
    100% {
      opacity: 1;
      transform: rotate(0) scale(1);
    }
  }

  .brush-button-faces.entering:global([data-start-reduced-motion]) {
    animation: none;
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

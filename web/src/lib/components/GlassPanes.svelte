<script lang="ts">
  import { toolbarGlassPanes, type OpenFlyout } from '$lib/glassPanes';
  import { layoutState } from '$lib/state/layout.svelte';
  let { openFlyout, drawerExpanded }: { openFlyout: OpenFlyout; drawerExpanded: boolean } =
    $props();
  const panes = $derived(toolbarGlassPanes(openFlyout, drawerExpanded));
</script>

{#each panes as pane, index (index)}
  <div
    class="glass-pane"
    aria-hidden="true"
    data-glass-pane={index}
    data-pane-orientation={layoutState.orientation}
    style:left={`${pane.x}px`}
    style:top={`${pane.y}px`}
    style:width={`${pane.width}px`}
    style:height={`${pane.height}px`}
    style:background-position={`${-pane.x}px ${-pane.y}px`}
    style:--glass-mask={pane.mask}
  ></div>
{/each}

<style>
  .glass-pane {
    position: fixed;
    pointer-events: none;
    z-index: var(--z-toolbar-paper);
    background-color: var(--paper);
    background-image: url('/icons/handmade-paper.webp');
    mask-image: var(--glass-mask);
    mask-size: 100% 100%;
    mask-repeat: no-repeat;
  }
  @supports (backdrop-filter: blur(1px)) {
    .glass-pane {
      background-color: rgb(var(--glass-tint-rgb) / var(--glass-strip));
      backdrop-filter: blur(5.1px);
    }
  }
  @media (prefers-reduced-transparency: reduce) {
    .glass-pane {
      background-color: var(--paper);
      backdrop-filter: none;
    }
  }
  @media (orientation: portrait) {
    .glass-pane[data-pane-orientation='landscape'] {
      visibility: hidden;
    }
  }
  @media (orientation: landscape) {
    .glass-pane[data-pane-orientation='portrait'] {
      visibility: hidden;
    }
  }
</style>

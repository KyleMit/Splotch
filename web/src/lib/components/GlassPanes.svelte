<script lang="ts">
  import { toolbarGlassPanes, type OpenFlyout } from '$lib/glassPanes';
  let { openFlyout, drawerExpanded }: { openFlyout: OpenFlyout; drawerExpanded: boolean } =
    $props();
  const panes = $derived(toolbarGlassPanes(openFlyout, drawerExpanded));
</script>

{#each panes as pane, index (index)}
  <div
    class="glass-pane"
    aria-hidden="true"
    data-glass-pane={index}
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
    background-color: rgb(var(--glass-tint-rgb) / var(--glass-strip));
    background-image: url('/icons/handmade-paper.webp');
    backdrop-filter: blur(5.1px);
    mask-image: var(--glass-mask);
    mask-size: 100% 100%;
    mask-repeat: no-repeat;
  }
  @media (prefers-reduced-transparency: reduce) {
    .glass-pane {
      background-color: var(--paper);
      backdrop-filter: none;
    }
  }
  @supports not (backdrop-filter: blur(1px)) {
    .glass-pane {
      background-color: var(--paper);
    }
  }
</style>

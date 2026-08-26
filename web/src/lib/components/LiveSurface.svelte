<script lang="ts">
  import { LIVE_TILE_COUNT } from '$lib/drawing/liveTiles';
  import { viewMatrix } from '$lib/drawing/paperView';
  import type { EngineViewState } from '$lib/drawing/engine';

  let {
    canvasEl = $bindable(),
    paperView,
    erasing = false,
  }: {
    canvasEl?: HTMLCanvasElement;
    paperView: EngineViewState;
    erasing?: boolean;
  } = $props();

  const liveTiles = Array.from({ length: LIVE_TILE_COUNT }, (_, index) => index);
  const paperTransform = $derived(
    `matrix(${viewMatrix({
      scale: paperView.scale,
      rotate: paperView.rotate,
      tx: paperView.tx,
      ty: paperView.ty,
    }).join(', ')})`
  );
  const paperCssWidth = $derived(paperView.paperCssWidth ? `${paperView.paperCssWidth}px` : '100%');
  const paperCssHeight = $derived(
    paperView.paperCssHeight ? `${paperView.paperCssHeight}px` : '100%'
  );
</script>

<!-- The stack is part of the engine's DOM contract: isolation keeps the
     crayon preview's darken layer from blending against the paper beneath. -->
<div class="canvas-stack">
  <canvas bind:this={canvasEl} id="drawingCanvas" class:erasing></canvas>
  <div
    class="live-paper-view"
    style:width={paperCssWidth}
    style:height={paperCssHeight}
    style:transform={paperTransform}
  >
    {#each liveTiles as tile (tile)}
      <canvas class="live-tile" data-live-tile aria-hidden="true" hidden></canvas>
      <canvas class="live-tile live-crayon-tile" data-live-crayon-bottom aria-hidden="true" hidden
      ></canvas>
      <canvas
        class="live-tile live-crayon-tile live-crayon-tile-top"
        data-live-crayon-top
        aria-hidden="true"
        hidden
      ></canvas>
    {/each}
  </div>
</div>

<style>
  .canvas-stack {
    position: relative;
    width: 100%;
    height: 100%;
    z-index: 1;
    isolation: isolate;
  }

  #drawingCanvas {
    position: relative;
    z-index: 3;
    display: block;
    cursor: crosshair;
    touch-action: none;
    width: 100%;
    height: 100%;
  }

  .live-paper-view {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
    /* Permanent promotion avoids the rotation undo spike; engine-rotation.spec.ts enforces it. */
    will-change: transform;
  }

  .live-tile {
    position: absolute;
    pointer-events: none;
    z-index: 1;
  }

  .live-crayon-tile {
    z-index: 2;
    /* EXPERIMENT (exp/crayon-i11-normal-blend-probe): normal instead of
       darken — the preview loses the glaze look; diagnostic only. */
    mix-blend-mode: normal;
  }

  .live-crayon-tile-top {
    mix-blend-mode: normal;
  }

  #drawingCanvas.erasing {
    cursor: none;
  }
</style>

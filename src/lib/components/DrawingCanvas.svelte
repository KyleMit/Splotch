<script>
  import { onMount } from 'svelte';
  import {
    initDrawingCanvas,
    setColor,
    setStrokeWidth,
    setEraserMode
  } from '$lib/drawing/engine.js';
  import { colors } from '$lib/state/colors.svelte.js';
  import { toolState } from '$lib/state/tool.svelte.js';
  import { canvasState } from '$lib/state/canvas.svelte.js';
  import { strokeState, getStrokeWidthPx } from '$lib/state/strokeWidth.svelte.js';
  import { coloringBookState } from '$lib/state/coloringBook.svelte.js';
  import { playDrawSound, stopDrawSound } from '$lib/audio/drawingSound.js';

  let canvasEl;

  onMount(() => {
    const engine = initDrawingCanvas(canvasEl, {
      initialColor: colors.activeColor,
      onDrawSound: playDrawSound,
      onDrawStop: stopDrawSound,
      onUndoStateChange: (canUndo) => {
        canvasState.canUndo = canUndo;
      },
      onCanvasEmptyChange: (empty) => {
        canvasState.canvasEmpty = empty;
      }
    });

    setStrokeWidth(getStrokeWidthPx());

    return () => engine.teardown();
  });

  // Reactive bridges: when the store changes, push into the imperative engine.
  $effect(() => {
    setColor(colors.activeColor);
  });

  $effect(() => {
    setStrokeWidth(getStrokeWidthPx(strokeState.size));
  });

  $effect(() => {
    setEraserMode(toolState.eraser);
  });

  // Body class tracks whether an overlay is active — paper texture moves
  // from the canvas to the container so the overlay can sit beneath strokes.
  $effect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('has-coloring-overlay', !!coloringBookState.overlayUrl);
  });
</script>

<div class="canvas-container">
  <img
    class="coloring-overlay"
    id="coloringOverlay"
    src={coloringBookState.overlayUrl ?? ''}
    alt=""
    hidden={!coloringBookState.overlayUrl}
  />
  <canvas bind:this={canvasEl} id="drawingCanvas" tabindex="0"></canvas>
</div>

<style>
  .canvas-container {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
    width: 100%;
    overflow: hidden;
  }

  #drawingCanvas {
    display: block;
    cursor: crosshair;
    touch-action: none;
    width: 100%;
    height: 100%;
    background-color: #fcfbf8;
    background-image: url('/icons/handmade-paper.webp');
    background-repeat: repeat;
    outline: none; /* Remove focus outline */
  }

  .coloring-overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none;
    z-index: 2;
    mix-blend-mode: multiply;
  }

  .coloring-overlay[hidden] {
    display: none;
  }

  @media (orientation: portrait) {
    .canvas-container {
      flex: 1;
      min-height: 0;
      width: 100%;
    }
  }
</style>

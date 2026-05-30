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
  let containerEl;

  // Bubble that previews the eraser footprint at the pointer while erasing.
  let eraserCursor = $state({ visible: false, x: 0, y: 0 });

  const eraserSizePx = $derived(getStrokeWidthPx(strokeState.size));

  function updateEraserCursor(e) {
    if (!toolState.eraser || !containerEl) return;
    const rect = containerEl.getBoundingClientRect();
    eraserCursor.x = e.clientX - rect.left;
    eraserCursor.y = e.clientY - rect.top;
    eraserCursor.visible = true;
  }

  function hideEraserCursor() {
    eraserCursor.visible = false;
  }

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
    if (!toolState.eraser) hideEraserCursor();
  });

  // Body class tracks whether an overlay is active — paper texture moves
  // from the canvas to the container so the overlay can sit beneath strokes.
  $effect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('has-coloring-overlay', !!coloringBookState.overlayUrl);
  });
</script>

<div class="canvas-container" bind:this={containerEl}>
  <img
    class="coloring-overlay"
    id="coloringOverlay"
    src={coloringBookState.overlayUrl ?? ''}
    alt=""
    hidden={!coloringBookState.overlayUrl}
  />
  <canvas
    bind:this={canvasEl}
    id="drawingCanvas"
    class:erasing={toolState.eraser}
    tabindex="0"
    onpointerdown={updateEraserCursor}
    onpointermove={updateEraserCursor}
    onpointerenter={updateEraserCursor}
    onpointerleave={hideEraserCursor}
  ></canvas>
  {#if eraserCursor.visible}
    <div
      class="eraser-bubble"
      style:left="{eraserCursor.x}px"
      style:top="{eraserCursor.y}px"
      style:width="{eraserSizePx}px"
      style:height="{eraserSizePx}px"
    ></div>
  {/if}
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

  #drawingCanvas.erasing {
    cursor: none;
  }

  .eraser-bubble {
    position: absolute;
    box-sizing: border-box;
    transform: translate(-50%, -50%);
    border: 2px solid rgba(80, 80, 80, 0.7);
    border-radius: 50%;
    background-color: rgba(255, 255, 255, 0.35);
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6);
    pointer-events: none;
    z-index: 3;
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

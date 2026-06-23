<script lang="ts">
  import { onMount } from 'svelte';
  import {
    initDrawingCanvas,
    setColor,
    setStrokeWidth,
    setEraserMode,
    getCanvasRect
  } from '$lib/drawing/engine';
  import { colors } from '$lib/state/colors.svelte';
  import { toolState } from '$lib/state/tool.svelte';
  import { canvasState } from '$lib/state/canvas.svelte';
  import { strokeState, activeStrokeSize, getStrokeWidthPx, getEraserWidthPx } from '$lib/state/strokeWidth.svelte';
  import { coloringBookState } from '$lib/state/coloringBook.svelte';
  import { settings } from '$lib/state/settings.svelte';
  import { playDrawSound, stopDrawSound, preloadDrawSounds } from '$lib/audio/drawingSound';

  let canvasEl: HTMLCanvasElement;

  // Bubble that previews the eraser footprint at the pointer while erasing.
  let eraserCursor = $state({ visible: false, x: 0, y: 0 });

  const eraserSizePx = $derived(getEraserWidthPx(strokeState.eraserSize));

  function updateEraserCursor(e: PointerEvent) {
    if (!toolState.eraser) return;
    // The canvas fills the container, so its cached client rect shares the
    // container's origin — reuse it instead of forcing another reflow per move.
    const rect = getCanvasRect();
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

    setStrokeWidth(getStrokeWidthPx(activeStrokeSize()));

    return () => engine.teardown();
  });

  // Warm up the pencil-sound assets as soon as sound is on (at mount, or when
  // toggled on later) so the first stroke isn't silent for a few seconds while
  // they fetch/decode. Skipped while sound is off to avoid the wasted download.
  $effect(() => {
    if (settings.soundEnabled) preloadDrawSounds();
  });

  // Reactive bridges: when the store changes, push into the imperative engine.
  $effect(() => {
    setColor(colors.activeColor);
  });

  // Push the active tool's level into the engine; re-runs when the level or the
  // tool changes, so switching pen↔eraser restores that tool's width.
  $effect(() => {
    setStrokeWidth(getStrokeWidthPx(activeStrokeSize()));
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

<div class="canvas-container">
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
      style:transform="translate3d({eraserCursor.x}px, {eraserCursor.y}px, 0) translate(-50%, -50%)"
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
    top: 0;
    left: 0;
    box-sizing: border-box;
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

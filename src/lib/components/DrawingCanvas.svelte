<script>
  import { onMount } from 'svelte';
  import {
    initDrawingCanvas,
    setColor,
    setStrokeWidth
  } from '$lib/drawing/engine.js';
  import { colors } from '$lib/state/colors.svelte.js';
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

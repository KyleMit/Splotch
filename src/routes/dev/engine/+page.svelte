<script>
  import { onMount, onDestroy } from 'svelte';
  import {
    initDrawingCanvas,
    setColor,
    setStrokeWidth,
    setEraserMode,
    undo,
    clearCanvas,
    isCanvasEmpty
  } from '$lib/drawing/engine';

  let canvasEl;
  let wrapperEl;
  let engine = null;

  // Mirrors how the app wires the engine (see DrawingCanvas.svelte), but routes
  // the undo/empty callbacks into a window object the Playwright spec inspects,
  // instead of into the Svelte stores.
  onMount(() => {
    engine = initDrawingCanvas(canvasEl, {
      initialColor: '#ff0000',
      onUndoStateChange: (canUndo) => {
        window.__engineState.canUndo = canUndo;
      },
      onCanvasEmptyChange: (empty) => {
        window.__engineState.canvasEmpty = empty;
      }
    });
    setStrokeWidth(8);

    window.__engineState = { canUndo: false, canvasEmpty: true };

    // Expose the real engine API + a few read helpers. The spec drives strokes
    // with real Playwright pointer input on the canvas; these are for the
    // imperative operations the app invokes from buttons (undo/clear) and for
    // reading the resulting bitmap.
    window.__engine = {
      setColor,
      setStrokeWidth,
      setEraserMode,
      undo,
      clearCanvas,
      isCanvasEmpty,

      // Count of non-transparent pixels on the visible canvas.
      nonTransparentCount() {
        const ctx = canvasEl.getContext('2d');
        const { data } = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
        let n = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) n++;
        return n;
      },

      // [r, g, b, a] at a canvas-space pixel.
      pixelAt(x, y) {
        const ctx = canvasEl.getContext('2d');
        return Array.from(ctx.getImageData(x, y, 1, 1).data);
      },

      // Resize the canvas box and fire the resize event the engine listens for,
      // so the spec can verify the virtual-canvas content survives a resize.
      resizeTo(w, h) {
        wrapperEl.style.width = `${w}px`;
        wrapperEl.style.height = `${h}px`;
        window.dispatchEvent(new Event('resize'));
      },

      // Synchronous synthetic stroke — used only by the color-change debounce
      // test, where the < 100ms timing must be deterministic (real Playwright
      // input can't reliably hit a sub-100ms window). Goes through the same
      // pointerdown/move/up handlers the engine binds.
      strokeSync(points, pointerType = 'mouse') {
        const rect = canvasEl.getBoundingClientRect();
        const ev = (type, p) =>
          canvasEl.dispatchEvent(
            new PointerEvent(type, {
              pointerId: 1,
              pointerType,
              clientX: rect.left + p.x,
              clientY: rect.top + p.y,
              bubbles: true,
              cancelable: true
            })
          );
        ev('pointerdown', points[0]);
        for (let i = 1; i < points.length; i++) ev('pointermove', points[i]);
        ev('pointerup', points[points.length - 1]);
      }
    };

    window.__engineReady = true;
  });

  onDestroy(() => {
    engine?.teardown();
  });
</script>

<div class="harness">
  <div class="canvas-wrapper" bind:this={wrapperEl}>
    <canvas bind:this={canvasEl} id="engineCanvas"></canvas>
  </div>
</div>

<style>
  .harness {
    margin: 0;
    padding: 0;
  }

  /* Fixed at the origin with a known size so the spec's pointer coordinates map
     1:1 onto canvas pixels (resizeCanvas sets canvas.width = rect.width). */
  .canvas-wrapper {
    position: fixed;
    top: 0;
    left: 0;
    width: 300px;
    height: 300px;
  }

  #engineCanvas {
    display: block;
    width: 100%;
    height: 100%;
    background: transparent;
    touch-action: none;
  }
</style>

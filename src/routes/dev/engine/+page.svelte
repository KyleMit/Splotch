<script lang="ts">
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

  let canvasEl: HTMLCanvasElement;
  let wrapperEl: HTMLDivElement;
  let engine: ReturnType<typeof initDrawingCanvas> | null = null;

  // The Playwright engine spec reaches the harness through these window globals.
  interface EngineHarnessWindow {
    __engineState: { canUndo: boolean; canvasEmpty: boolean };
    __engine: Record<string, unknown>;
    __engineReady: boolean;
  }
  const win = window as unknown as Window & EngineHarnessWindow;

  // Mirrors how the app wires the engine (see DrawingCanvas.svelte), but routes
  // the undo/empty callbacks into a window object the Playwright spec inspects,
  // instead of into the Svelte stores.
  onMount(() => {
    engine = initDrawingCanvas(canvasEl, {
      initialColor: '#ff0000',
      onUndoStateChange: (canUndo) => {
        win.__engineState.canUndo = canUndo;
      },
      onCanvasEmptyChange: (empty) => {
        win.__engineState.canvasEmpty = empty;
      }
    });
    setStrokeWidth(8);

    win.__engineState = { canUndo: false, canvasEmpty: true };

    // Expose the real engine API + a few read helpers. The spec drives strokes
    // with real Playwright pointer input on the canvas; these are for the
    // imperative operations the app invokes from buttons (undo/clear) and for
    // reading the resulting bitmap.
    win.__engine = {
      setColor,
      setStrokeWidth,
      setEraserMode,
      undo,
      clearCanvas,
      isCanvasEmpty,

      // Count of non-transparent pixels on the visible canvas.
      nonTransparentCount() {
        const ctx = canvasEl.getContext('2d')!;
        const { data } = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
        let n = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) n++;
        return n;
      },

      // [r, g, b, a] at a canvas-space pixel.
      pixelAt(x: number, y: number) {
        const ctx = canvasEl.getContext('2d')!;
        return Array.from(ctx.getImageData(x, y, 1, 1).data);
      },

      // Resize the canvas box and fire the resize event the engine listens for,
      // so the spec can verify the virtual-canvas content survives a resize.
      resizeTo(w: number, h: number) {
        wrapperEl.style.width = `${w}px`;
        wrapperEl.style.height = `${h}px`;
        window.dispatchEvent(new Event('resize'));
      },

      // Synchronous synthetic stroke — used only by the color-change debounce
      // test, where the < 100ms timing must be deterministic (real Playwright
      // input can't reliably hit a sub-100ms window). Goes through the same
      // pointerdown/move/up handlers the engine binds.
      strokeSync(points: { x: number; y: number }[], pointerType = 'mouse') {
        const rect = canvasEl.getBoundingClientRect();
        const ev = (type: string, p: { x: number; y: number }) =>
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
      },

      // Synchronous synthetic multi-touch — drives several pointers at once
      // through the same pointerdown/move/up handlers the engine binds. Every
      // pointer goes down first, then all advance one step at a time in lockstep
      // (round-robin), then all lift — so the engine is tracking up to N
      // concurrent pointerIds (its activePointers map is keyed by pointerId) the
      // way real multi-touch arrives. Used by the multi-touch spec, where the
      // simultaneity must be deterministic in a single synchronous tick.
      multiStrokeSync(
        strokes: { pointerId: number; points: { x: number; y: number }[] }[],
        pointerType = 'touch'
      ) {
        const rect = canvasEl.getBoundingClientRect();
        const ev = (type: string, pointerId: number, p: { x: number; y: number }) =>
          canvasEl.dispatchEvent(
            new PointerEvent(type, {
              pointerId,
              pointerType,
              isPrimary: false,
              clientX: rect.left + p.x,
              clientY: rect.top + p.y,
              bubbles: true,
              cancelable: true
            })
          );

        for (const s of strokes) ev('pointerdown', s.pointerId, s.points[0]);

        const maxLen = Math.max(...strokes.map((s) => s.points.length));
        for (let i = 1; i < maxLen; i++) {
          for (const s of strokes) {
            if (i < s.points.length) ev('pointermove', s.pointerId, s.points[i]);
          }
        }

        for (const s of strokes) {
          ev('pointerup', s.pointerId, s.points[s.points.length - 1]);
        }
      }
    };

    win.__engineReady = true;
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
     1:1 onto canvas pixels (resizeCanvas sets canvas.width = rect.width ×
     renderScale, and Playwright's default deviceScaleFactor of 1 keeps
     renderScale at 1). */
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

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    initDrawingCanvas,
    setColor,
    setStrokeWidth,
    setEraserMode,
    setBrushVariant,
    setSafeAreaInsets,
    undo,
    clearCanvas,
    isCanvasEmpty,
    exportCanvasBlob,
    getUndoDebug,
    setSimplifyParams,
    setScreenAngleOverride,
    getViewState,
    RESIZE_SETTLE_MS,
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
  function wireEngine() {
    engine = initDrawingCanvas(canvasEl, {
      initialColor: '#ff0000',
      onUndoStateChange: (canUndo) => {
        win.__engineState.canUndo = canUndo;
      },
      onCanvasEmptyChange: (empty) => {
        win.__engineState.canvasEmpty = empty;
      },
    });
    setStrokeWidth(8);
  }

  onMount(() => {
    wireEngine();

    win.__engineState = { canUndo: false, canvasEmpty: true };

    // Expose the real engine API + a few read helpers. The spec drives strokes
    // with real Playwright pointer input on the canvas; these are for the
    // imperative operations the app invokes from buttons (undo/clear) and for
    // reading the resulting bitmap.
    win.__engine = {
      setColor,
      setStrokeWidth,
      setEraserMode,
      setBrushVariant,
      setSafeAreaInsets,
      undo,
      clearCanvas,
      isCanvasEmpty,
      exportCanvasBlob,
      getUndoDebug,
      setSimplifyParams,
      // Rotation seam: pins the screen angle the engine reads, so a spec can
      // simulate a device rotation (setScreenAngleOverride(90) + resizeTo(...))
      // and inspect the resulting paper view (ADR-0050).
      setScreenAngleOverride,
      getViewState,

      // Teardown + re-init on the same canvas — the client-side-navigation
      // lifecycle (`/` → `/privacy` → `/`, ADR-0004). Drawing state persists
      // across the cycle by design; pointer-input state must not.
      remount() {
        engine?.teardown();
        wireEngine();
      },

      // Decode an exported blob and count its stroke pixels. The harness draws
      // in pure red; the paper background never is, so a red count > 0 means
      // the drawing made it into the export.
      async blobRedPixelCount(blob: Blob | null) {
        if (!blob) return -1;
        const bitmap = await createImageBitmap(blob);
        const decodeCanvas = document.createElement('canvas');
        decodeCanvas.width = bitmap.width;
        decodeCanvas.height = bitmap.height;
        const decodeCtx = decodeCanvas.getContext('2d')!;
        decodeCtx.drawImage(bitmap, 0, 0);
        const { data } = decodeCtx.getImageData(0, 0, bitmap.width, bitmap.height);
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] > 200 && data[i + 1] < 100 && data[i + 2] < 100) n++;
        }
        return n;
      },

      // Count of non-transparent pixels on the visible canvas.
      nonTransparentCount() {
        const ctx = canvasEl.getContext('2d')!;
        const { data } = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height);
        let n = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) n++;
        return n;
      },

      // Bounding box (backing-store px) of the non-transparent pixels, so a spec
      // can assert a stroke's extent survives a rebuild (e.g. a scribble's tips
      // don't shrink after simplification, ADR-0036). Empty canvas → null.
      inkBounds() {
        const ctx = canvasEl.getContext('2d')!;
        const { width, height } = canvasEl;
        const { data } = ctx.getImageData(0, 0, width, height);
        let minX = width,
          minY = height,
          maxX = -1,
          maxY = -1;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (data[(y * width + x) * 4 + 3] !== 0) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        return maxX < 0 ? null : { minX, minY, maxX, maxY };
      },

      // [r, g, b, a] at a canvas-space pixel.
      pixelAt(x: number, y: number) {
        const ctx = canvasEl.getContext('2d')!;
        return Array.from(ctx.getImageData(x, y, 1, 1).data);
      },

      crayonMetrics(x: number, y: number, width: number, height: number) {
        const ctx = canvasEl.getContext('2d')!;
        const { data } = ctx.getImageData(x, y, width, height);
        let covered = 0;
        let dense = 0;
        let nonRed = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] > 0) covered++;
          if (data[i + 3] > 210) dense++;
          if (data[i + 3] > 0 && (data[i] !== 255 || data[i + 1] !== 0 || data[i + 2] !== 0))
            nonRed++;
        }
        return { covered, dense, nonRed };
      },

      // Resize the canvas box and fire the resize event the engine listens for,
      // so the spec can verify the drawing (rebuilt from the baseline + command
      // log) survives a resize. The engine debounces the rebuild until the size
      // settles, so resolve only after that window has passed.
      resizeTo(w: number, h: number) {
        wrapperEl.style.width = `${w}px`;
        wrapperEl.style.height = `${h}px`;
        window.dispatchEvent(new Event('resize'));
        return new Promise<void>((resolve) => setTimeout(resolve, RESIZE_SETTLE_MS + 50));
      },

      // Rotation-while-backgrounded seam (issue #305): a hidden document fires
      // no resize/orientationchange, so apply the new box silently and fire
      // only the visibilitychange that re-entry produces. The engine's re-sync
      // rebuilds synchronously — no settle wait.
      resumeTo(w: number, h: number) {
        wrapperEl.style.width = `${w}px`;
        wrapperEl.style.height = `${h}px`;
        document.dispatchEvent(new Event('visibilitychange'));
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
              cancelable: true,
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
              cancelable: true,
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
      },
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

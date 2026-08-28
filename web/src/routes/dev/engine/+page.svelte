<script lang="ts">
  import { onMount } from 'svelte';
  import LiveSurface from '$lib/components/LiveSurface.svelte';
  import { compositeVisibleLiveTiles } from '$lib/drawing/liveTileComposite';
  import { setCrayonDepositionForTuning } from '$lib/drawing/crayonPassBuffer';
  import {
    INITIAL_ENGINE_VIEW_STATE,
    initDrawingCanvas,
    setColor,
    setStrokeWidth,
    setEraserMode,
    setMagicMode,
    setSafeAreaInsets,
    undo,
    clearCanvas,
    isCanvasEmpty,
    prepareCanvasExport,
    exportCanvasBlob,
    getUndoDebug,
    setCrayonMode,
    setCrayonParams,
    setScreenAngleOverride,
    getViewState,
    RESIZE_SETTLE_MS,
    type EngineViewState,
  } from '$lib/drawing/engine';

  let canvasEl: HTMLCanvasElement = $state()!;
  let wrapperEl: HTMLDivElement;
  let engine: ReturnType<typeof initDrawingCanvas> | null = null;
  let paperView = $state<EngineViewState>({ ...INITIAL_ENGINE_VIEW_STATE });

  // The Playwright engine spec reaches the harness through these window globals.
  interface EngineHarnessWindow {
    __engineState: Window['__engineState'];
    __engine: ReturnType<typeof buildEngineApi>;
    __engineReady: boolean;
  }
  // ssr = false in +page.ts is what makes this top-level window read safe (see the comment there).
  const win = window as unknown as Window & EngineHarnessWindow;

  // Mirrors how the app wires the engine (see DrawingCanvas.svelte), but routes
  // the undo/empty callbacks into a window object the Playwright spec inspects,
  // instead of into the Svelte stores.
  function wireEngine() {
    win.__engineState = {
      canUndo: false,
      canvasEmpty: true,
      drawStops: win.__engineState?.drawStops ?? 0,
      strokeEnds: win.__engineState?.strokeEnds ?? 0,
    };
    engine = initDrawingCanvas(canvasEl, {
      initialColor: '#ff0000',
      onUndoStateChange: (canUndo) => {
        win.__engineState.canUndo = canUndo;
      },
      onCanvasEmptyChange: (empty) => {
        win.__engineState.canvasEmpty = empty;
      },
      // Counted, not mirrored: a spec asserting that an event ran NO group
      // completion needs to see that neither callback fired again, and
      // onStrokeEnd fires only when a group really committed.
      onDrawStop: () => {
        win.__engineState.drawStops++;
      },
      onStrokeEnd: () => {
        win.__engineState.strokeEnds++;
      },
      onViewChange: (view) => {
        Object.assign(paperView, view);
      },
    });
    win.__engineState.canvasEmpty = isCanvasEmpty();
    win.__engineState.canUndo = getUndoDebug().snapshots > 0;
    setStrokeWidth(8);
  }

  function renderedCanvas() {
    return compositeVisibleLiveTiles(wrapperEl);
  }

  // Every synchronous input seam below dispatches through here, onto the canvas
  // the engine bound its listeners to. Coordinates are canvas-space.
  function firePointerEvent(
    type: string,
    pointerId: number,
    p: { x: number; y: number },
    pointerType: string,
    buttons = 0
  ) {
    const rect = canvasEl.getBoundingClientRect();
    canvasEl.dispatchEvent(
      new PointerEvent(type, {
        pointerId,
        pointerType,
        buttons,
        clientX: rect.left + p.x,
        clientY: rect.top + p.y,
        bubbles: true,
        cancelable: true,
      })
    );
  }

  // Expose the real engine API + a few read helpers. The spec drives strokes
  // with real Playwright pointer input on the canvas; these are for the
  // imperative operations the app invokes from buttons (undo/clear) and for
  // reading the resulting bitmap.
  // Annotated against the ambient Window.__engine contract (web/tests/global.d.ts)
  // that the Playwright specs compile against, so a harness member that drifts
  // from that spec-facing contract errors here instead of type-checking silently.
  function buildEngineApi(): Window['__engine'] {
    return {
      setColor,
      setStrokeWidth,
      setEraserMode,
      // Magic brush (ADR-0043): with no color sheet set, the engine locks a
      // random rainbow on the first stroke — enough for perf replay of
      // magic-heavy recordings (replay-input-recording.mjs).
      setMagicMode,
      setSafeAreaInsets,
      undo,
      clearCanvas,
      isCanvasEmpty,
      prepareCanvasExport,
      exportCanvasBlob,
      getUndoDebug,
      // Crayon brush (ADR-0065): toggle the textured-wax mode and A/B its tooth
      // knobs. The spec draws crayon strokes via strokeSync after setCrayonMode.
      setCrayonMode,
      setCrayonParams,
      setCrayonDeposition: setCrayonDepositionForTuning,
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

      // Count of non-transparent pixels across the composited live tiles.
      nonTransparentCount() {
        const rendered = renderedCanvas();
        const { data } = rendered
          .getContext('2d')!
          .getImageData(0, 0, rendered.width, rendered.height);
        let n = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) n++;
        return n;
      },

      // Bounding box (backing-store px) of the non-transparent pixels, so a spec
      // can assert a stroke's extent survives a rebuild (resize, remount).
      // Empty canvas → null.
      inkBounds() {
        const rendered = renderedCanvas();
        const ctx = rendered.getContext('2d')!;
        const { width, height } = rendered;
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
        const ctx = renderedCanvas().getContext('2d')!;
        return Array.from(ctx.getImageData(x, y, 1, 1).data);
      },

      pixelsIn(x: number, y: number, width: number, height: number) {
        const ctx = renderedCanvas().getContext('2d')!;
        return Array.from(ctx.getImageData(x, y, width, height).data);
      },

      // Resize the canvas box and fire the resize event the engine listens for,
      // so the spec can verify the tiled drawing survives a resize. The engine
      // debounces the rebuild until the size
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

      // Apply a new box with no event at all — the layout pass that lands after
      // a re-entry the engine has already handled. Lets a spec reproduce the
      // unmeasured-rect resume (resumeTo(0, 0), then the real box arrives here)
      // without the second visibilitychange that would itself re-sync the
      // engine and hide the bug. Test-only: nothing in the app resizes the
      // canvas silently.
      layoutTo(w: number, h: number) {
        wrapperEl.style.width = `${w}px`;
        wrapperEl.style.height = `${h}px`;
      },

      // Synchronous synthetic stroke — used only by the color-change debounce
      // test, where the < 100ms timing must be deterministic (real Playwright
      // input can't reliably hit a sub-100ms window). Goes through the same
      // pointerdown/move/up handlers the engine binds.
      strokeSync(points: { x: number; y: number }[], pointerType = 'mouse') {
        const ev = (type: string, p: { x: number; y: number }) =>
          firePointerEvent(type, 1, p, pointerType);
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
        const ev = (type: string, pointerId: number, p: { x: number; y: number }) =>
          firePointerEvent(type, pointerId, p, pointerType);

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

      // Synchronous synthetic pointer script — an arbitrary ordered sequence,
      // each step naming its own event type and pointer. This is the seam for
      // orderings the two lockstep seams above cannot express: interleaving one
      // pointer's lift with another pointer's moves (multiStrokeSync lifts
      // everything only after every move), and firing a bare pointercancel or
      // pointerout for an id the engine is not tracking.
      pointerEventsSync(
        events: {
          type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel' | 'pointerout';
          pointerId: number;
          x: number;
          y: number;
          buttons?: number;
        }[],
        pointerType = 'touch'
      ) {
        for (const e of events) {
          firePointerEvent(e.type, e.pointerId, { x: e.x, y: e.y }, pointerType, e.buttons ?? 0);
        }
      },
    };
  }

  onMount(() => {
    wireEngine();
    win.__engine = buildEngineApi();
    win.__engineReady = true;
  });

  $effect(() => {
    return () => engine?.teardown();
  });
</script>

<!-- Deliberately bare, unlike the sibling harnesses: nobody browses this page —
     it's an automated Playwright target, and chrome would only sit under the
     viewport-pinned canvas the specs read pixels and pointer coordinates from. -->
<div class="harness">
  <div class="canvas-wrapper" bind:this={wrapperEl}>
    <LiveSurface bind:canvasEl {paperView} />
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
</style>

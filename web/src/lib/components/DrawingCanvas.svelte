<script lang="ts">
  import { onMount } from 'svelte';
  import {
    initDrawingCanvas,
    setColor,
    setStrokeWidth,
    setEraserMode,
    setMagicMode,
    setColorSheet,
    setSafeAreaInsets,
    getCanvasRect,
    type EngineViewState,
  } from '$lib/drawing/engine';
  import { viewMatrix } from '$lib/drawing/paperView';
  import { layout } from '$lib/state/layout.svelte';
  import { colors } from '$lib/state/colors.svelte';
  import { toolState } from '$lib/state/tool.svelte';
  import { canvasState } from '$lib/state/canvas.svelte';
  import {
    strokeState,
    activeStrokeSize,
    getStrokeWidthPx,
    getEraserWidthPx,
  } from '$lib/state/strokeWidth.svelte';
  import { coloringBookState } from '$lib/state/coloringBook.svelte';
  import { settings } from '$lib/state/settings.svelte';
  import { playDrawSound, stopDrawSound, preloadDrawSounds } from '$lib/audio/drawingSound';
  import { isNative } from '$lib/platform';
  import FullscreenToggle from './FullscreenToggle.svelte';

  let canvasEl: HTMLCanvasElement;

  // Bubble that previews the eraser footprint at the pointer while erasing.
  let eraserCursor = $state({ visible: false, x: 0, y: 0 });

  // The engine's paper view (ADR-0048): identity in normal use; after a device
  // rotation with ink on the canvas it presents the locked paper upright,
  // contain-fit and centered (scaled down when it doesn't fit). The overlay
  // wrapper below is positioned with the exact same transform the canvas paints
  // through, so page art and strokes stay aligned.
  let paperView = $state<EngineViewState>({
    active: false,
    scale: 1,
    rotate: 0,
    tx: 0,
    ty: 0,
    paperCssWidth: 0,
    paperCssHeight: 0,
    paperOrientation: 'portrait',
  });

  const paperTransform = $derived(
    `matrix(${viewMatrix({
      scale: paperView.scale,
      rotate: paperView.rotate,
      tx: paperView.tx,
      ty: paperView.ty,
    }).join(', ')})`
  );

  const eraserSizePx = $derived(
    getEraserWidthPx(strokeState.eraserSize) * (paperView.active ? paperView.scale : 1)
  );

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
      },
      onStrokeEnd: () => {
        canvasState.strokeCount++;
      },
      onViewChange: (view) => {
        Object.assign(paperView, view);
        canvasState.paperOrientation = view.paperOrientation;
      },
    });

    setStrokeWidth(getStrokeWidthPx(activeStrokeSize()));

    // Apple Pencil double-tap → toggle eraser (iOS native only). Not needed for the
    // first paint or first stroke (a toddler draws with a finger, and even a pencil
    // user won't double-tap in the opening frames), so its chunk load + native bridge
    // subscription is deferred to idle time to keep it off the mount/first-paint path.
    // Subscription is async, so hold the cleanup behind a ref the teardown can call
    // once it resolves. The literal __IS_CAPACITOR__ keeps the wrapper (and
    // @capacitor/core) out of the web bundle; the inline import() resolves to the
    // module namespace, never the plugin proxy. iOS WebView lacks requestIdleCallback,
    // so fall back to a short timeout that still lands after first paint.
    let pencilCleanup: (() => void) | undefined;
    let pencilIdle: number | undefined;
    const pencilIdleSupported = typeof requestIdleCallback === 'function';
    if (__IS_CAPACITOR__ && isNative()) {
      const initPencil = () => {
        import('$lib/plugins/pencilEraser').then(({ initPencilEraser }) => {
          pencilCleanup = initPencilEraser();
        });
      };
      pencilIdle = pencilIdleSupported
        ? requestIdleCallback(initPencil)
        : (setTimeout(initPencil, 200) as unknown as number);
    }

    return () => {
      engine.teardown();
      if (pencilIdle !== undefined) {
        if (pencilIdleSupported) cancelIdleCallback(pencilIdle);
        else clearTimeout(pencilIdle);
      }
      pencilCleanup?.();
    };
  });

  // Tell the engine where the OS gesture/navbar zones are so it can ignore
  // edge-swipes that summon the system bars (see engine EDGE_SWIPE_BAND_PX).
  // The insets move between edges on rotation; the shared layout module
  // re-measures them, and this re-pushes whenever a value actually changes.
  $effect(() => {
    setSafeAreaInsets({ ...layout.safeArea });
  });

  // Warm up the pencil-sound assets (357 KB — half the first-visit transfer) so
  // the first stroke isn't silent while they fetch/decode. Deferred to idle time
  // so they don't compete with the canvas for first-visit bandwidth; if the kid
  // draws first, `playDrawSound` triggers the same preload on pointerdown, so the
  // audible-first-stroke guarantee holds either way. Skipped while sound is off.
  $effect(() => {
    if (!settings.soundEnabled) return;
    // requestIdleCallback is unsupported on Safari/iOS (below the floor), so fall
    // back to a short timeout that still lands after first paint.
    const idle = typeof requestIdleCallback === 'function';
    const handle: number = idle
      ? requestIdleCallback(() => preloadDrawSounds())
      : (setTimeout(preloadDrawSounds, 200) as unknown as number);
    return () => (idle ? cancelIdleCallback(handle) : clearTimeout(handle));
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

  // The magic brush reveals the active page's colored twin (ADR-0043). Keep the
  // engine's sheet in lockstep with the applied page, and its mode with the tool.
  // The line art (overlayUrl) is passed too so the twin's own outlines can be
  // masked out of the reveal — the overlay stays the single source of line work.
  $effect(() => {
    setColorSheet(coloringBookState.colorSheetUrl, coloringBookState.overlayUrl);
  });

  $effect(() => {
    setMagicMode(toolState.magic);
  });

  // Body class tracks whether an overlay is active — paper texture moves
  // from the canvas to the container so the overlay can sit beneath strokes.
  $effect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('has-coloring-overlay', !!coloringBookState.overlayUrl);
  });
</script>

<div class="canvas-container">
  <!-- Tracks the engine's paper: full-container in normal use, upright
       contain-fit while a rotation has the paper locked (ADR-0048). The overlay
       art contain-fits within it, mirroring the magic sheet's math, so the page
       and the strokes move as one sheet. The lifted outline marks the page edge
       when the paper is letterboxed. -->
  <div
    class="paper-view"
    class:paper-lifted={paperView.active}
    style:width="{paperView.paperCssWidth}px"
    style:height="{paperView.paperCssHeight}px"
    style:transform={paperTransform}
    hidden={!coloringBookState.overlayUrl && !paperView.active}
  >
    <img
      class="coloring-overlay"
      id="coloringOverlay"
      src={coloringBookState.overlayUrl ?? ''}
      alt=""
      hidden={!coloringBookState.overlayUrl}
    />
  </div>
  <canvas
    bind:this={canvasEl}
    id="drawingCanvas"
    class:erasing={toolState.eraser}
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
  <FullscreenToggle />
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

  /* The multiply blend lives on the wrapper (not the img): the transform makes
     the wrapper a stacking context, which would confine an inner mix-blend-mode
     to the wrapper's own (transparent) backdrop instead of the canvas below. */
  .paper-view {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
    pointer-events: none;
    z-index: 2;
    mix-blend-mode: multiply;
  }

  .paper-view[hidden] {
    display: none;
  }

  /* Page-edge affordance while the paper is letterboxed: a soft frame that
     multiplies into a slightly darker line, reading as the sheet's edge. */
  .paper-lifted {
    outline: 2px solid #e6e0d6;
    border-radius: 3px;
  }

  .coloring-overlay {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
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

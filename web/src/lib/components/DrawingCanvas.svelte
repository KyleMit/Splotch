<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import {
    adoptDrawingCanvas,
    setColor,
    setEraserMode,
    setColorSheet,
    setSafeAreaInsets,
    INITIAL_ENGINE_VIEW_STATE,
    type EngineViewState,
  } from '$lib/drawing/engine';
  import { pushToolStateToEngine } from '$lib/drawing/earlyBoot';
  import { COLORING_OVERLAY_ID } from '$lib/drawing/overlay';
  import { viewMatrix } from '$lib/drawing/paperView';
  import { layout } from '$lib/state/layout.svelte';
  import { colors } from '$lib/state/colors.svelte';
  import { toolState } from '$lib/state/tool.svelte';
  import { canvasState } from '$lib/state/canvas.svelte';
  import { coloringBookModal } from '$lib/state/ui.svelte';
  import { strokeState, getStrokeWidthPx, getEraserWidthPx } from '$lib/state/strokeWidth.svelte';
  import {
    overlayUrl,
    coloringBookState,
    themedOverlayUrl as currentThemedOverlayUrl,
    colorSheetUrl,
    nightSheetUrl,
  } from '$lib/state/coloringBook.svelte';
  import { resolvedTheme } from '$lib/state/appearance.svelte';
  import { pageCompositionKey } from '$lib/state/books';
  import {
    canPlayDrawingSound,
    playDrawSound,
    preloadDrawSounds,
    preloadFirstDrawSound,
    stopDrawSound,
  } from '$lib/audio/drawingSound';
  import { isNative } from '$lib/platform';
  import { scheduleIdle } from '$lib/idle';
  import { prefetchImages } from '$lib/imagePrefetch';
  import FullscreenToggle from './FullscreenToggle.svelte';
  import LiveSurface from './LiveSurface.svelte';
  import PointerHalos from './PointerHalos.svelte';

  let canvasEl: HTMLCanvasElement = $state()!;
  let pointerHalos: PointerHalos;

  // The engine's paper view (ADR-0050): identity in normal use; after a device
  // rotation with ink on the canvas it presents the locked paper upright,
  // contain-fit and centered (scaled down when it doesn't fit). The overlay
  // wrapper below is positioned with the exact same transform the canvas paints
  // through, so page art and strokes stay aligned.
  const paperView = $state<EngineViewState>({ ...INITIAL_ENGINE_VIEW_STATE });
  let paperPresentationResident = $state(!!overlayUrl());

  $effect(() => {
    if (coloringBookModal.open || overlayUrl()) {
      paperPresentationResident = true;
    }
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

  // Pen and magic strokes share the pen width (the engine applies no multiplier
  // to magic ops), so both ring flavors share this size.
  const brushRingSizePx = $derived(
    getStrokeWidthPx(strokeState.penSize) * (paperView.active ? paperView.scale : 1)
  );

  // The sheet/wrapper track the engine's paper; before the engine reports a
  // size, fill the container and let responsive-image selection use the viewport.
  const paperCssWidth = $derived(paperView.paperCssWidth ? `${paperView.paperCssWidth}px` : '100%');
  const paperCssHeight = $derived(
    paperView.paperCssHeight ? `${paperView.paperCssHeight}px` : '100%'
  );
  onMount(() => {
    // Adopt, don't init (ADR-0072): earlyBoot.ts already started the engine on
    // this prerendered canvas at module-evaluation time, so drawing works
    // before hydration; this mount attaches the reactive callbacks and replays
    // any state pre-hydration strokes advanced. When the engine isn't live on
    // this exact element (client-side nav back to `/`, dev HMR), adopt falls
    // back to a full init.
    const engine = adoptDrawingCanvas(canvasEl, {
      initialColor: colors.activeColor,
      onDrawSound: playDrawSound,
      onDrawStop: stopDrawSound,
      onUndoStateChange: (canUndo) => {
        canvasState.canUndo = canUndo;
      },
      onCanvasEmptyChange: (empty) => {
        canvasState.canvasEmpty = empty;
      },
      // The engine tells us where a stroke really began, so a down-less pen
      // stream it adopts mid-move (WebKit merges a fast tap-then-stroke into
      // one, dropping the pointerdown) grows its ring like any other stroke.
      // Ordinary strokes reach PointerHalos's own pointerdown listener too and
      // land the same ring.
      onStrokeStart: (stroke) => {
        if (toolState.brush === 'eraser') return;
        pointerHalos?.growBrushRing(stroke);
      },
      onStrokeEnd: () => {
        canvasState.strokeCount++;
      },
      onViewChange: (view) => {
        Object.assign(paperView, view);
        canvasState.paperOrientation = view.paperOrientation;
        canvasState.paperCssWidth = view.paperCssWidth;
      },
    });

    // Apple Pencil double-tap → toggle eraser (iOS native only). Not needed for the
    // first paint or first stroke (a toddler draws with a finger, and even a pencil
    // user won't double-tap in the opening frames), so its chunk load + native bridge
    // subscription is deferred to idle time to keep it off the mount/first-paint path.
    // Subscription is async, so hold the cleanup behind a ref the teardown can call
    // once it resolves. The literal __IS_CAPACITOR__ keeps the wrapper (and
    // @capacitor/core) out of the web bundle; the inline import() resolves to the
    // module namespace, never the plugin proxy.
    let pencilCleanup: (() => void) | undefined;
    let cancelPencilIdle: (() => void) | undefined;
    if (__IS_CAPACITOR__ && isNative()) {
      const initPencil = () => {
        import('$lib/plugins/pencilEraser').then(({ initPencilEraser }) => {
          pencilCleanup = initPencilEraser();
        });
      };
      cancelPencilIdle = scheduleIdle(initPencil);
    }

    return () => {
      engine.teardown();
      cancelPencilIdle?.();
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

  // The first 119 KB pencil sound is prepared on the earliest drawing boot path.
  // The other variants stay behind idle so their transfer and decode do not
  // compete with first paint. Enabling drawing sound later takes the same fast path.
  $effect(() => {
    if (!canPlayDrawingSound()) {
      stopDrawSound();
      return;
    }
    preloadFirstDrawSound();
    return scheduleIdle(preloadDrawSounds);
  });

  // Reactive bridges: when the store changes, push into the imperative engine.
  $effect(() => {
    setColor(colors.activeColor);
  });

  // Push the toolState-derived engine settings the pre-hydration boot also
  // pushes (the helper's reads of toolState.brush and activeStrokeSize() are
  // this effect's dependencies), so switching pen↔eraser restores that tool's
  // width and the crayon/magic modifiers follow the brush.
  $effect(() => {
    pushToolStateToEngine();
  });

  $effect(() => {
    setEraserMode(toolState.brush === 'eraser');
  });

  // The magic brush reveals the active page's colored fill (ADR-0043), theme-
  // aware (ADR-0052 direction B): light mode reveals the light fill; dark mode
  // reveals the pre-colored NIGHT fill where one exists, falling back to the
  // light fill for pages/orientations whose night asset isn't generated yet.
  // The canonical SVG is the presentation, export, and Magic authority. Selector
  // surfaces use responsive raster previews, but the paper never substitutes a
  // derivative whose registration or scale could diverge from the SVG.
  // Reading resolvedTheme() re-picks the theme sibling on a live switch.
  const themedOverlayUrl = $derived(currentThemedOverlayUrl(resolvedTheme()));

  // Ready-gated overlay art swap. A blank-canvas rotation re-adopts the paper
  // and swaps the page art to the other tall/wide composition. Hide art when
  // the composition changes, decode the browser-selected file off-DOM, and show
  // it only once ready. A theme sibling has identical registration, so it
  // keeps the current art visible until the sibling is ready.
  let displayedOverlayUrl = $state<string | null>(null);

  $effect(() => {
    const url = themedOverlayUrl;
    if (!url) {
      displayedOverlayUrl = null;
      return;
    }
    const displayed = untrack(() => displayedOverlayUrl);
    if (!displayed || pageCompositionKey(displayed) !== pageCompositionKey(url)) {
      displayedOverlayUrl = null;
    }
    let stale = false;
    const img = new Image();
    img.fetchPriority = 'high';
    img.src = url;
    // Show on decode failure too — the <img> then surfaces the same broken
    // state a direct src assignment would have.
    const show = () => {
      if (!stale) {
        displayedOverlayUrl = url;
      }
    };
    img.decode().then(show, show);
    return () => {
      stale = true;
    };
  });

  // The canonical line art is the only asset needed to make a selected page visible.
  // Start the magic fill and rotation warm-up after it decodes so those
  // other art transfers cannot delay the page the child just picked.
  $effect(() => {
    const url = themedOverlayUrl;
    const displayed = displayedOverlayUrl;
    if (!url) {
      setColorSheet(null);
      return;
    }
    if (displayed !== url) {
      return;
    }
    const theme = resolvedTheme();
    const nightUrl = theme === 'dark' ? nightSheetUrl() : null;
    setColorSheet(nightUrl ?? colorSheetUrl());
    const other = coloringBookState.orientation === 'portrait' ? 'landscape' : 'portrait';
    const otherUrl = currentThemedOverlayUrl(theme, other);
    if (!otherUrl) return;
    return scheduleIdle(() => prefetchImages([otherUrl]));
  });
</script>

<div class="canvas-container">
  <!-- The paper sheet: the off-white textured page the child draws on, sitting
       beneath the (transparent) canvas. Full-container in normal use; after a
       rotation locks the paper (ADR-0050) it carries the same transform the
       canvas paints through, so the page reads as a distinct sheet over the
       container's plain lighter margins — no border needed. -->
  <div
    class="paper-sheet"
    class:paper-lifted={paperView.active}
    style:width={paperCssWidth}
    style:height={paperCssHeight}
    style:transform={paperTransform}
  ></div>
  <!-- The coloring page overlay, positioned against the same paper so the art
       contain-fits exactly where the magic sheet's math puts its colors, and
       page + strokes move as one sheet across rotations. -->
  <div
    class="paper-view"
    class:paper-presentation-resident={paperPresentationResident}
    data-paper-active={overlayUrl() ? '' : undefined}
    style:width={paperCssWidth}
    style:height={paperCssHeight}
    style:transform={paperPresentationResident ? paperTransform : undefined}
  >
    <img
      class="coloring-overlay"
      class:overlay-ready={!!displayedOverlayUrl}
      id={COLORING_OVERLAY_ID}
      src={displayedOverlayUrl ?? ''}
      decoding="async"
      data-canonical-url={themedOverlayUrl ?? undefined}
      alt=""
      hidden={!overlayUrl()}
    />
  </div>
  <LiveSurface bind:canvasEl {paperView} erasing={toolState.brush === 'eraser'} />
  <PointerHalos bind:this={pointerHalos} {canvasEl} {eraserSizePx} {brushRingSizePx} />
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
    /* Only visible around the lifted paper sheet while a rotation has the paper
       locked: a flat tone slightly apart from the sheet's so the original page
       reads as distinct without any border line. */
    background-color: var(--paper-margin);
  }

  .paper-sheet {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
    z-index: 0;
    pointer-events: none;
    /* The texture is a low-alpha grain layer, so the theme only has to swap
       the color beneath it — same webp in light and dark. */
    background-color: var(--paper);
    background-image: url('/icons/handmade-paper.webp');
    background-repeat: repeat;
  }

  .paper-sheet.paper-lifted {
    box-shadow: 0 2px 14px rgba(93, 84, 68, 0.18);
  }

  /* The generated overlay carries only transparent black or white ink, so it
     can use ordinary source-over composition without a full-page blend/filter
     layer. */
  .paper-view {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
    pointer-events: none;
    z-index: 2;
    mix-blend-mode: normal;
  }

  .paper-view.paper-presentation-resident {
    will-change: transform;
  }

  /* Hidden while the next art variant decodes, then shown once it's ready —
     see displayedOverlayUrl. */
  .coloring-overlay {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    opacity: 0;
  }

  .coloring-overlay.overlay-ready {
    opacity: 1;
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

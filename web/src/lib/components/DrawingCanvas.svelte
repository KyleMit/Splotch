<script lang="ts">
  import { onMount } from 'svelte';
  import {
    initDrawingCanvas,
    setColor,
    setStrokeWidth,
    setEraserMode,
    setMagicMode,
    setCrayonMode,
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
  import { resolvedTheme } from '$lib/state/appearance.svelte';
  import { settings } from '$lib/state/settings.svelte';
  import { playDrawSound, stopDrawSound, preloadDrawSounds } from '$lib/audio/drawingSound';
  import { isNative } from '$lib/platform';
  import { scheduleIdle } from '$lib/idle';
  import FullscreenToggle from './FullscreenToggle.svelte';

  let canvasEl: HTMLCanvasElement;

  // Bubble that previews the eraser footprint at the pointer while erasing.
  let eraserCursor = $state({ visible: false, x: 0, y: 0 });

  // Impact rings that track each drawing pointer while a stroke is live (pen and
  // magic brush; the eraser has its own bubble above). One ring per active
  // pointer — toddlers draw with several fingers at once — sized to the stroke
  // width so the area of impact is visible around the fingertip. The magic
  // brush's ring is a rainbow so its reveal behavior is legible (issue #187);
  // whether a ring is rainbow is captured at pointerdown, matching how the
  // engine stamps `magic` onto ops at stroke start. Rings die with the stroke:
  // up/cancel/leave, plus lostpointercapture for strokes the engine ends itself
  // (releaseAllPointers — a second finger pressing a swatch or dragging the
  // clear button never sends this canvas a pointerup).
  let brushRings = $state<Record<number, { x: number; y: number; magic: boolean }>>({});

  // The engine's paper view (ADR-0050): identity in normal use; after a device
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

  // Pen and magic strokes share the pen width (the engine applies no multiplier
  // to magic ops), so both ring flavors share this size.
  const brushRingSizePx = $derived(
    getStrokeWidthPx(strokeState.penSize) * (paperView.active ? paperView.scale : 1)
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

  function handlePointerDown(e: PointerEvent) {
    if (toolState.eraser) {
      updateEraserCursor(e);
      return;
    }
    const rect = getCanvasRect();
    brushRings[e.pointerId] = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      magic: toolState.magic,
    };
  }

  function handlePointerMove(e: PointerEvent) {
    if (toolState.eraser) {
      updateEraserCursor(e);
      return;
    }
    const ring = brushRings[e.pointerId];
    if (!ring) {
      // Strokes the engine starts without a canvas pointerdown still deserve a
      // ring: WebKit can merge a fast pen tap-then-stroke into one down-less
      // stream the engine adopts mid-move (see isOrphanPenContact), and a drag
      // from a palette swatch hands its pointer over mid-gesture
      // (adoptPointerStroke). Both capture the pointer to the canvas, so
      // pressed buttons + the engine's capture is the adopted stroke's
      // signature — grow its missing ring here. The capture check also keeps a
      // stroke the engine already ended (releaseAllPointers) from regrowing its
      // ring on later moves.
      if (e.buttons !== 0 && canvasEl.hasPointerCapture(e.pointerId)) {
        handlePointerDown(e);
      }
      return;
    }
    const rect = getCanvasRect();
    ring.x = e.clientX - rect.left;
    ring.y = e.clientY - rect.top;
  }

  function removeBrushRing(e: PointerEvent) {
    delete brushRings[e.pointerId];
  }

  function handlePointerLeave(e: PointerEvent) {
    hideEraserCursor();
    removeBrushRing(e);
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

  // Warm up the pencil-sound assets (357 KB — half the first-visit transfer) so
  // the first stroke isn't silent while they fetch/decode. Deferred to idle time
  // so they don't compete with the canvas for first-visit bandwidth; if the kid
  // draws first, `playDrawSound` triggers the same preload on pointerdown, so the
  // audible-first-stroke guarantee holds either way. Skipped while sound is off.
  $effect(() => {
    if (!settings.soundEnabled) return;
    return scheduleIdle(() => preloadDrawSounds());
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
    if (toolState.eraser) brushRings = {};
    else hideEraserCursor();
  });

  // The magic brush reveals the active page's colored fill (ADR-0043), theme-
  // aware (ADR-0052 direction B): light mode reveals the light fill; dark mode
  // reveals the pre-colored NIGHT fill where one exists, falling back to the
  // light fill for pages/orientations whose night asset isn't generated yet.
  // Both fills ship fills-only (outlines punched to transparency at build time),
  // so the overlay <img> stays the single source of line work. Reading
  // resolvedTheme() re-runs this on a live theme switch, re-rasterizing the sheet.
  $effect(() => {
    const nightUrl = resolvedTheme() === 'dark' ? coloringBookState.nightSheetUrl : null;
    setColorSheet(nightUrl ?? coloringBookState.colorSheetUrl);
  });

  $effect(() => {
    setMagicMode(toolState.magic);
  });

  // The crayon is the freehand brush (ADR-0065) — it replaced the plain pen, so
  // any normal stroke (neither eraser nor magic) draws with it.
  $effect(() => {
    setCrayonMode(!toolState.eraser && !toolState.magic);
  });

  // The overlay's line art is theme-aware: dark mode shows the page's CHALK
  // outline where one exists (shipped ink-on-white, so the same
  // --lineart-filter invert + screen treatment renders it as white chalk),
  // falling back to inverting the pen outline for un-forked pages. Reading
  // resolvedTheme() re-picks the art on a live theme switch.
  const themedOverlayUrl = $derived(
    resolvedTheme() === 'dark'
      ? (coloringBookState.chalkUrl ?? coloringBookState.overlayUrl)
      : coloringBookState.overlayUrl
  );

  // Ready-gated overlay art swap. A blank-canvas rotation re-adopts the paper
  // and swaps the page art to the other tall/wide variant — a different
  // composition. Pointing the <img> straight at the new URL shows the old art
  // mis-fit in the new layout, then pops the new one in whenever it decodes.
  // Instead: hide the art the moment the target changes, decode the new file
  // off-DOM, and fade it in only once it's ready. Applying a page from the
  // picker flows through the same gate.
  let displayedOverlayUrl = $state<string | null>(null);
  $effect(() => {
    const url = themedOverlayUrl;
    displayedOverlayUrl = null;
    if (!url) return;
    let stale = false;
    const img = new Image();
    img.src = url;
    // Show on decode failure too — the <img> then surfaces the same broken
    // state a direct src assignment would have.
    const show = () => {
      if (!stale) displayedOverlayUrl = url;
    };
    img.decode().then(show, show);
    return () => {
      stale = true;
    };
  });

  // The sheet/wrapper track the engine's paper; before the engine mounts and
  // reports a size, fall back to filling the container so the SSR'd shell shows
  // the full-bleed paper texture with no flash.
  const paperCssWidth = $derived(paperView.paperCssWidth ? `${paperView.paperCssWidth}px` : '100%');
  const paperCssHeight = $derived(
    paperView.paperCssHeight ? `${paperView.paperCssHeight}px` : '100%'
  );

  // The line-art overlay's mix-blend-mode composites against a STALE snapshot
  // of the canvas while a stroke is live: painting into the 2D canvas doesn't
  // invalidate the blend layer above it, so the blend only re-evaluates when
  // something else repaints — which used to be the pointerup Svelte writes,
  // making dark-mode ink under the chalk lines look dim until the finger
  // lifted (issue #307). Toggling an imperceptible translateZ epsilon on the
  // wrapper damages the blend layer once per input event (pointermoves are
  // coalesced to ~one per frame), forcing the screen/multiply blend to
  // recompute against the current canvas pixels mid-stroke. The two transform
  // values must differ NUMERICALLY — alternating `translateZ(0)` with nothing
  // flattens to the same matrix and the compositor would skip the damage.
  let blendNudge = $state(false);

  function nudgeBlendLayer(e: PointerEvent) {
    if (!coloringBookState.overlayUrl) return;
    if (e.type === 'pointermove' && e.buttons === 0) return;
    blendNudge = !blendNudge;
  }

  // The nudge wraps the ring handlers at the template level instead of living
  // inside them: an adopted stroke's first move routes handlePointerMove into
  // handlePointerDown to grow its missing ring, and a nudge inside each would
  // toggle twice before Svelte flushes — a net no-op that would leave exactly
  // that first adopted frame on the stale backdrop.
  function handleCanvasPointerDown(e: PointerEvent) {
    nudgeBlendLayer(e);
    handlePointerDown(e);
  }

  function handleCanvasPointerMove(e: PointerEvent) {
    nudgeBlendLayer(e);
    handlePointerMove(e);
  }

  const paperViewTransform = $derived(
    `${paperTransform} translateZ(${blendNudge ? '0.01px' : '0'})`
  );
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
    style:width={paperCssWidth}
    style:height={paperCssHeight}
    style:transform={paperViewTransform}
    hidden={!coloringBookState.overlayUrl}
  >
    <img
      class="coloring-overlay"
      class:overlay-ready={!!displayedOverlayUrl}
      id="coloringOverlay"
      src={displayedOverlayUrl ?? ''}
      alt=""
      hidden={!coloringBookState.overlayUrl}
    />
  </div>
  <canvas
    bind:this={canvasEl}
    id="drawingCanvas"
    class:erasing={toolState.eraser}
    onpointerdown={handleCanvasPointerDown}
    onpointermove={handleCanvasPointerMove}
    onpointerenter={updateEraserCursor}
    onpointerleave={handlePointerLeave}
    onpointerup={removeBrushRing}
    onpointercancel={removeBrushRing}
    onlostpointercapture={removeBrushRing}
  ></canvas>
  {#each Object.entries(brushRings) as [id, ring] (id)}
    <div
      class="brush-ring"
      class:magic={ring.magic}
      style:transform="translate3d({ring.x}px, {ring.y}px, 0) translate(-50%, -50%)"
      style:width="{brushRingSizePx}px"
      style:height="{brushRingSizePx}px"
    ></div>
  {/each}
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

  #drawingCanvas {
    display: block;
    cursor: crosshair;
    touch-action: none;
    width: 100%;
    height: 100%;
    position: relative;
    z-index: 1;
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

  /* content-box puts the ring line just OUTSIDE the stroke footprint (the
     element's width/height), so even the thinnest stroke keeps a visible ring
     around the fingertip. The faint white halo keeps the grey line legible on
     the dark paper too. */
  .brush-ring {
    position: absolute;
    top: 0;
    left: 0;
    box-sizing: content-box;
    border: 2px solid rgba(80, 80, 80, 0.35);
    border-radius: 50%;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.35);
    pointer-events: none;
    z-index: 3;
  }

  /* Magic-brush flavor: a conic rainbow masked down to the outer band (the
     padding takes the border's place outside the footprint). The -webkit-
     duplicate is load-bearing — Chrome only unprefixed `mask` in 120, above
     the Chrome 111 floor (docs/COMPATIBILITY.md). */
  .brush-ring.magic {
    border: none;
    padding: 3px;
    background: conic-gradient(#ff5e5e, #ffa94d, #ffe066, #69db7c, #4dabf7, #b197fc, #ff5e5e);
    -webkit-mask: radial-gradient(
      farthest-side,
      transparent calc(100% - 3.5px),
      #000 calc(100% - 3px)
    );
    mask: radial-gradient(farthest-side, transparent calc(100% - 3.5px), #000 calc(100% - 3px));
  }

  /* The blend lives on the wrapper (not the img): the transform makes the
     wrapper a stacking context, which would confine an inner mix-blend-mode to
     the wrapper's own (transparent) backdrop instead of the canvas below.
     Light: black lines multiply over the light paper. Dark: the img's
     --lineart-filter inverts the art to white-on-black and screen makes the
     black transparent-equivalent — white "chalk" lines over the dark paper
     (ADR-0052 direction B). will-change keeps the wrapper on its own
     compositor layer so the mid-stroke blend nudge (see nudgeBlendLayer) is a
     composite-only update — no per-frame repaint of the line art. */
  .paper-view {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
    pointer-events: none;
    z-index: 2;
    mix-blend-mode: var(--lineart-blend);
    will-change: transform;
  }

  .paper-view[hidden] {
    display: none;
  }

  /* Hidden instantly while the next art variant decodes (no transition on the
     way out), then faded in once it's ready — see displayedOverlayUrl. */
  .coloring-overlay {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    opacity: 0;
    filter: var(--lineart-filter);
  }

  .coloring-overlay.overlay-ready {
    opacity: 1;
    transition: opacity 0.18s ease;
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

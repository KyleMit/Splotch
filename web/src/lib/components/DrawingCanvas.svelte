<script lang="ts">
  import { onMount } from 'svelte';
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
  import { strokeState, getStrokeWidthPx, getEraserWidthPx } from '$lib/state/strokeWidth.svelte';
  import {
    overlayUrl,
    chalkUrl,
    colorSheetUrl,
    nightSheetUrl,
  } from '$lib/state/coloringBook.svelte';
  import { resolvedTheme } from '$lib/state/appearance.svelte';
  import { settings } from '$lib/state/settings.svelte';
  import { playDrawSound, stopDrawSound, preloadDrawSounds } from '$lib/audio/drawingSound';
  import { isNative } from '$lib/platform';
  import { scheduleIdle } from '$lib/idle';
  import FullscreenToggle from './FullscreenToggle.svelte';
  import PointerHalos from './PointerHalos.svelte';

  let canvasEl: HTMLCanvasElement = $state()!;
  let pointerHalos: PointerHalos;

  // The engine's paper view (ADR-0050): identity in normal use; after a device
  // rotation with ink on the canvas it presents the locked paper upright,
  // contain-fit and centered (scaled down when it doesn't fit). The overlay
  // wrapper below is positioned with the exact same transform the canvas paints
  // through, so page art and strokes stay aligned.
  let paperView = $state<EngineViewState>({ ...INITIAL_ENGINE_VIEW_STATE });

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
  // Both fills ship fills-only (outlines punched to transparency at build time),
  // so the overlay <img> stays the single source of line work. Reading
  // resolvedTheme() re-runs this on a live theme switch, re-rasterizing the sheet.
  $effect(() => {
    const nightUrl = resolvedTheme() === 'dark' ? nightSheetUrl() : null;
    setColorSheet(nightUrl ?? colorSheetUrl());
  });

  // The overlay's line art is theme-aware: dark mode shows the page's CHALK
  // outline where one exists (shipped ink-on-white, so the same
  // --lineart-filter invert + screen treatment renders it as white chalk),
  // falling back to inverting the pen outline for un-forked pages. Reading
  // resolvedTheme() re-picks the art on a live theme switch.
  const themedOverlayUrl = $derived(
    resolvedTheme() === 'dark' ? (chalkUrl() ?? overlayUrl()) : overlayUrl()
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
  // wrapper damages the blend layer, forcing the screen/multiply blend to
  // recompute against the current canvas pixels mid-stroke. The two transform
  // values must differ NUMERICALLY — alternating `translateZ(0)` with nothing
  // flattens to the same matrix and the compositor would skip the damage.
  //
  // Damaged at most once per FRAME, not once per input event. `perf:ipad:frames`
  // measured 1.9-4.2 pointermoves per presentable frame on an iPad Pro (Safari
  // gives web content a 60 Hz rAF beat while the digitizer runs at 120 Hz+), so
  // an event-driven nudge asked the compositor for three or four full-paper blend
  // recomposites that no frame could ever show. One per frame is exactly what
  // #307 needs — the blend has to be current in each frame that paints, and there
  // is no finer unit than that. Scheduling in rAF also puts the damage before the
  // rendering update it belongs to.
  let blendNudge = $state(false);
  // Deliberately untracked: a scheduling latch the template never reads.
  let blendNudgeFrame: number | null = null;

  function nudgeBlendLayer(e: PointerEvent) {
    if (!overlayUrl()) return;
    if (e.type === 'pointermove' && e.buttons === 0) return;
    if (blendNudgeFrame !== null) return;
    blendNudgeFrame = requestAnimationFrame(() => {
      blendNudgeFrame = null;
      blendNudge = !blendNudge;
    });
  }

  $effect(() => () => {
    if (blendNudgeFrame !== null) cancelAnimationFrame(blendNudgeFrame);
  });

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
    hidden={!overlayUrl()}
  >
    <img
      class="coloring-overlay"
      class:overlay-ready={!!displayedOverlayUrl}
      id={COLORING_OVERLAY_ID}
      src={displayedOverlayUrl ?? ''}
      alt=""
      hidden={!overlayUrl()}
    />
  </div>
  <!-- The stack isolates the canvas + the engine's crayon pass overlays into
       one blending group, so the overlays' darken preview mixes against the
       CANVAS's own pixels (transparent where virgin — pure colour shows) and
       never against the paper behind it. Without isolation, a fresh stroke
       previews faint on the dark paper (min(colour, near-black) erases the
       blend layer) until its pass stamps. -->
  <div class="canvas-stack">
    <canvas
      bind:this={canvasEl}
      id="drawingCanvas"
      class:erasing={toolState.brush === 'eraser'}
      onpointerdown={nudgeBlendLayer}
      onpointermove={nudgeBlendLayer}
    ></canvas>
    <!-- The engine's live crayon pass overlays (bottom darken layer, then the
         opacity-mixed top — see engine.ts's crayonOverlay notes). Rendered
         here, not injected by the engine: the engine boots BEFORE hydration
         (ADR-0072), and elements it inserted into the prerendered DOM made
         Svelte's hydration walk bail to a full client re-render, replacing
         the live canvas. Template-owned markup hydrates cleanly; the engine
         adopts the pair by the data attribute. -->
    <canvas class="crayon-overlay" data-crayon-overlay aria-hidden="true"></canvas>
    <canvas class="crayon-overlay crayon-overlay-top" data-crayon-overlay aria-hidden="true"
    ></canvas>
  </div>
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

  .canvas-stack {
    position: relative;
    width: 100%;
    height: 100%;
    z-index: 1;
    isolation: isolate;
  }

  #drawingCanvas {
    display: block;
    cursor: crosshair;
    touch-action: none;
    width: 100%;
    height: 100%;
  }

  #drawingCanvas.erasing {
    cursor: none;
  }

  /* Mirrors the inline styling the engine applies when it creates its own
     overlays (the /dev/engine harness path) — keep the two in sync. */
  .crayon-overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 2;
    mix-blend-mode: darken;
  }

  .crayon-overlay-top {
    mix-blend-mode: normal;
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

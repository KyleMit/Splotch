<script lang="ts">
  import { untrack } from 'svelte';
  import { getCanvasRect, type StrokeStartData } from '$lib/drawing/engine';
  import { toolState } from '$lib/state/tool.svelte';
  import { prefersReducedMotion } from '$lib/platform/reducedMotion';

  // Pointer-following halos: the eraser footprint bubble and the per-pointer
  // brush rings. Purely presentational — its only inputs are pointer events on
  // the canvas, the tool state, and the two caller-computed ring sizes.
  interface Props {
    canvasEl: HTMLCanvasElement;
    eraserSizePx: number;
    brushRingSizePx: number;
  }

  let { canvasEl, eraserSizePx, brushRingSizePx }: Props = $props();

  // Bubble that previews the eraser footprint at the pointer while erasing.
  // `lifting` holds it one exit past the moment it is dismissed.
  const eraserCursor = $state({ visible: false, lifting: false, x: 0, y: 0 });

  // Impact rings that track each drawing pointer while a stroke is live (pen and
  // magic brush; the eraser has its own bubble above). One ring per active
  // pointer — toddlers draw with several fingers at once — sized to the stroke
  // width so the area of impact is visible around the fingertip. The magic
  // brush's ring is a rainbow so its reveal behavior is legible (issue #187);
  // whether a ring is rainbow is captured at the engine's stroke start, the
  // same moment it stamps `magic` onto the stroke's ops — a stream the engine
  // adopts mid-move (see growBrushRing) has no pointerdown to read it from.
  // Rings die with the stroke: up/cancel/leave, plus lostpointercapture for
  // strokes the engine ends itself (releaseAllPointers — a second finger
  // pressing a swatch or dragging the clear button never sends this canvas a
  // pointerup). A ring grows in on mount and, when its stroke ends, lifts off
  // where the finger left it (`lifting`: position writes stop) before its record
  // goes. Under reduced motion there is no lift and the record goes at once.
  let brushRings = $state<
    Record<number, { x: number; y: number; magic: boolean; lifting: boolean }>
  >({});

  // The immediate path, for the events that must not wait a frame: the bubble
  // appearing where the finger already is on enter and on press. Moves take the
  // coalesced path below.
  function updateEraserCursor(e: PointerEvent) {
    if (toolState.brush !== 'eraser') return;
    // Supersede a move still waiting on the frame: it is older than this event,
    // so letting the flush apply it afterwards would snap the bubble back to
    // where the finger was before.
    eraserPendingMove = false;
    // The canvas fills the container, so its cached client rect shares the
    // container's origin — reuse it instead of forcing another reflow per move.
    const rect = getCanvasRect();
    eraserCursor.x = e.clientX - rect.left;
    eraserCursor.y = e.clientY - rect.top;
    eraserCursor.visible = true;
    eraserCursor.lifting = false;
  }

  function hideEraserCursor() {
    eraserPendingMove = false;
    if (!eraserCursor.visible) return;
    if (prefersReducedMotion()) {
      eraserCursor.visible = false;
      eraserCursor.lifting = false;
    } else eraserCursor.lifting = true;
  }

  function endEraserLift(e: AnimationEvent) {
    if (e.target !== e.currentTarget || !eraserCursor.lifting) return;
    eraserCursor.visible = false;
    eraserCursor.lifting = false;
  }

  // Exported so the parent's engine `onStrokeStart` callback (a down-less pen
  // stream WebKit merges into an adopted mid-move stroke) can grow the same
  // ring an ordinary pointerdown would.
  export function growBrushRing(stroke: StrokeStartData) {
    const rect = getCanvasRect();
    brushRings[stroke.pointerId] = {
      x: stroke.clientX - rect.left,
      y: stroke.clientY - rect.top,
      magic: stroke.magic,
      lifting: false,
    };
  }

  function handlePointerDown(e: PointerEvent) {
    if (toolState.brush === 'eraser') {
      updateEraserCursor(e);
      return;
    }
    growBrushRing({
      pointerId: e.pointerId,
      clientX: e.clientX,
      clientY: e.clientY,
      magic: toolState.brush === 'magic',
    });
  }

  // Halo positions are written at most once per FRAME, not once per input event.
  // A halo has exactly one visible position per painted frame, and Safari gives
  // web content a 60 Hz rAF beat while an iPad digitizer delivers 120 Hz+, so an
  // event-driven write spends three or four reactive writes and DOM transform
  // updates producing one visible position. The latest pending position per
  // halo wins, so it still lands where the finger is. Erasing runs the same
  // stroke path underneath as drawing, so the bubble is on the same hot path as
  // the rings and shares their flush.
  //
  // Plain coordinates, deliberately NOT `$state` and deliberately not a Map:
  // this is scheduling state the template never reads, so a SvelteMap's
  // reactivity would be pure cost on the hottest path in the component, and a
  // `{x, y}` literal per event would break the hot-path rule's no-allocation
  // requirement. The flush allocates a key list, but it runs once a frame.
  const pendingRingX: Record<number, number> = {};
  const pendingRingY: Record<number, number> = {};
  let pendingEraserX = 0;
  let pendingEraserY = 0;
  // Deliberately untracked: scheduling state the template never reads.
  let eraserPendingMove = false;
  let haloMoveFrame: number | null = null;

  function scheduleHaloFlush() {
    if (haloMoveFrame === null) haloMoveFrame = requestAnimationFrame(flushHaloMoves);
  }

  function flushHaloMoves() {
    haloMoveFrame = null;
    if (eraserPendingMove) {
      eraserPendingMove = false;
      eraserCursor.x = pendingEraserX;
      eraserCursor.y = pendingEraserY;
      eraserCursor.visible = true;
      eraserCursor.lifting = false;
    }
    for (const key of Object.keys(pendingRingX)) {
      const pointerId = Number(key);
      const ring = brushRings[pointerId];
      if (ring && !ring.lifting) {
        ring.x = pendingRingX[pointerId];
        ring.y = pendingRingY[pointerId];
      }
      delete pendingRingX[pointerId];
      delete pendingRingY[pointerId];
    }
  }

  function handlePointerMove(e: PointerEvent) {
    if (toolState.brush === 'eraser') {
      const rect = getCanvasRect();
      pendingEraserX = e.clientX - rect.left;
      pendingEraserY = e.clientY - rect.top;
      eraserPendingMove = true;
      scheduleHaloFlush();
      return;
    }
    if (!brushRings[e.pointerId] || brushRings[e.pointerId].lifting) return;
    const rect = getCanvasRect();
    pendingRingX[e.pointerId] = e.clientX - rect.left;
    pendingRingY[e.pointerId] = e.clientY - rect.top;
    scheduleHaloFlush();
  }

  function removeBrushRing(e: PointerEvent) {
    const ring = brushRings[e.pointerId];
    if (ring && !prefersReducedMotion()) ring.lifting = true;
    else delete brushRings[e.pointerId];
    // A queued move for a ring that is leaving would otherwise be flushed onto
    // it, or onto the next stroke that reuses the pointerId.
    delete pendingRingX[e.pointerId];
    delete pendingRingY[e.pointerId];
  }

  function endRingLift(e: AnimationEvent, pointerId: number) {
    if (e.target === e.currentTarget && brushRings[pointerId]?.lifting)
      delete brushRings[pointerId];
  }

  function handlePointerLeave(e: PointerEvent) {
    hideEraserCursor();
    removeBrushRing(e);
  }

  // Own listeners straight on the canvas element rather than routing through
  // parent-forwarded props/callbacks — this presentational concern observes the
  // same DOM events as the engine, independently of it.
  $effect(() => {
    const listenerCanvas = canvasEl;
    listenerCanvas.addEventListener('pointerdown', handlePointerDown);
    listenerCanvas.addEventListener('pointermove', handlePointerMove);
    listenerCanvas.addEventListener('pointerenter', updateEraserCursor);
    listenerCanvas.addEventListener('pointerleave', handlePointerLeave);
    listenerCanvas.addEventListener('pointerup', removeBrushRing);
    listenerCanvas.addEventListener('pointercancel', removeBrushRing);
    listenerCanvas.addEventListener('lostpointercapture', removeBrushRing);
    return () => {
      listenerCanvas.removeEventListener('pointerdown', handlePointerDown);
      listenerCanvas.removeEventListener('pointermove', handlePointerMove);
      listenerCanvas.removeEventListener('pointerenter', updateEraserCursor);
      listenerCanvas.removeEventListener('pointerleave', handlePointerLeave);
      listenerCanvas.removeEventListener('pointerup', removeBrushRing);
      listenerCanvas.removeEventListener('pointercancel', removeBrushRing);
      listenerCanvas.removeEventListener('lostpointercapture', removeBrushRing);
      if (haloMoveFrame !== null) {
        cancelAnimationFrame(haloMoveFrame);
        haloMoveFrame = null;
      }
    };
  });

  $effect(() => {
    if (toolState.brush === 'eraser') brushRings = {};
    else untrack(hideEraserCursor);
  });
</script>

{#each Object.entries(brushRings) as [id, ring] (id)}
  <div
    class="brush-ring"
    class:magic={ring.magic}
    class:lifting={ring.lifting}
    onanimationend={(e) => endRingLift(e, Number(id))}
    style:transform="translate3d({ring.x}px, {ring.y}px, 0) translate(-50%, -50%)"
    style:width="{brushRingSizePx}px"
    style:height="{brushRingSizePx}px"
  ></div>
{/each}
{#if eraserCursor.visible}
  <div
    class="eraser-bubble"
    class:lifting={eraserCursor.lifting}
    onanimationend={endEraserLift}
    style:transform="translate3d({eraserCursor.x}px, {eraserCursor.y}px, 0) translate(-50%, -50%)"
    style:width="{eraserSizePx}px"
    style:height="{eraserSizePx}px"
  ></div>
{/if}

<style>
  /* A halo grows in where the finger lands and lifts off where it left. Both
     animate the independent `scale` property: `transform` is written inline
     every frame to follow the finger, and a keyframe on it would fight those
     writes. Mount-time only — nothing here runs on the per-frame path. */
  .brush-ring,
  .eraser-bubble {
    /* Short enough to read as the halo answering the touch rather than
       arriving late to it; the lift a beat longer, so it reads as leaving. */
    --halo-in-duration: 120ms;
    --halo-out-duration: 140ms;
    animation: halo-in var(--halo-in-duration) var(--ease-glide) both;
  }

  .brush-ring.lifting,
  .eraser-bubble.lifting {
    animation: halo-out var(--halo-out-duration) var(--ease-glide) forwards;
  }

  @keyframes halo-in {
    from {
      opacity: 0;
      scale: 0.7;
    }
  }

  @keyframes halo-out {
    to {
      opacity: 0;
      scale: 1.12;
    }
  }

  /* Instant, like the halos have always been; the script drops a lifted halo's
     record at once under the same answer, since no animationend will come. */
  :global(:root[data-reduce-motion]) .brush-ring,
  :global(:root[data-reduce-motion]) .eraser-bubble {
    animation: none;
  }

  .eraser-bubble {
    position: absolute;
    top: 0;
    left: 0;
    box-sizing: border-box;
    border: 2px solid rgb(80 80 80 / 70%);
    border-radius: 50%;
    background-color: rgb(255 255 255 / 35%);
    box-shadow: 0 0 0 1px rgb(255 255 255 / 60%);
    pointer-events: none;
    z-index: var(--z-pointer-halo);
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
    border: 2px solid rgb(80 80 80 / 35%);
    border-radius: 50%;
    box-shadow: 0 0 0 1px rgb(255 255 255 / 35%);
    pointer-events: none;
    z-index: var(--z-pointer-halo);
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
</style>

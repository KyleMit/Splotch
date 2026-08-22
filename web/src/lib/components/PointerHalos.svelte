<script lang="ts">
  import { getCanvasRect, type StrokeStartData } from '$lib/drawing/engine';
  import { toolState } from '$lib/state/tool.svelte';

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
  let eraserCursor = $state({ visible: false, x: 0, y: 0 });

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
  // pointerup).
  let brushRings = $state<Record<number, { x: number; y: number; magic: boolean }>>({});

  function updateEraserCursor(e: PointerEvent) {
    if (toolState.brush !== 'eraser') return;
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

  // Exported so the parent's engine `onStrokeStart` callback (a down-less pen
  // stream WebKit merges into an adopted mid-move stroke) can grow the same
  // ring an ordinary pointerdown would.
  export function growBrushRing(stroke: StrokeStartData) {
    const rect = getCanvasRect();
    brushRings[stroke.pointerId] = {
      x: stroke.clientX - rect.left,
      y: stroke.clientY - rect.top,
      magic: stroke.magic,
    };
  }

  // A fingertip already covers the ring it would draw, so on touch the ring
  // buys nothing and costs a composited layer that moves every frame of every
  // stroke. A pen or a mouse keeps it: there the contact point is visible and
  // the ring is the only thing showing the stroke's footprint.
  const HALO_POINTER_TYPES = new Set(['pen', 'mouse']);

  function handlePointerDown(e: PointerEvent) {
    if (toolState.brush === 'eraser') {
      updateEraserCursor(e);
      return;
    }
    if (!HALO_POINTER_TYPES.has(e.pointerType)) return;
    growBrushRing({
      pointerId: e.pointerId,
      clientX: e.clientX,
      clientY: e.clientY,
      magic: toolState.brush === 'magic',
    });
  }

  // Ring positions are written at most once per FRAME, not once per input event.
  // A ring has exactly one visible position per painted frame, and Safari gives
  // web content a 60 Hz rAF beat while an iPad digitizer delivers 120 Hz+, so an
  // event-driven write spends three or four reactive writes and DOM transform
  // updates producing one visible position. The latest pending position per
  // pointer wins, so the ring still lands where the finger is.
  //
  // Two plain coordinate records, deliberately NOT `$state` and deliberately not
  // a Map: this is scheduling state the template never reads, so a SvelteMap's
  // reactivity would be pure cost on the hottest path in the component, and a
  // `{x, y}` literal per event would break the hot-path rule's no-allocation
  // requirement. The flush allocates a key list, but it runs once a frame.
  const pendingRingX: Record<number, number> = {};
  const pendingRingY: Record<number, number> = {};
  // Deliberately untracked: a scheduling latch the template never reads.
  let ringMoveFrame: number | null = null;

  function flushRingMoves() {
    ringMoveFrame = null;
    for (const key of Object.keys(pendingRingX)) {
      const pointerId = Number(key);
      const ring = brushRings[pointerId];
      if (ring) {
        ring.x = pendingRingX[pointerId];
        ring.y = pendingRingY[pointerId];
      }
      delete pendingRingX[pointerId];
      delete pendingRingY[pointerId];
    }
  }

  function handlePointerMove(e: PointerEvent) {
    if (toolState.brush === 'eraser') {
      updateEraserCursor(e);
      return;
    }
    if (!brushRings[e.pointerId]) return;
    const rect = getCanvasRect();
    pendingRingX[e.pointerId] = e.clientX - rect.left;
    pendingRingY[e.pointerId] = e.clientY - rect.top;
    if (ringMoveFrame === null) ringMoveFrame = requestAnimationFrame(flushRingMoves);
  }

  function removeBrushRing(e: PointerEvent) {
    delete brushRings[e.pointerId];
    // A queued move for a ring that is gone would otherwise be flushed onto the
    // next stroke that reuses the pointerId.
    delete pendingRingX[e.pointerId];
    delete pendingRingY[e.pointerId];
  }

  function handlePointerLeave(e: PointerEvent) {
    hideEraserCursor();
    removeBrushRing(e);
  }

  // Own listeners straight on the canvas element rather than routing through
  // parent-forwarded props/callbacks — this presentational concern observes the
  // same DOM events as the engine, independently of it.
  $effect(() => {
    canvasEl.addEventListener('pointerdown', handlePointerDown);
    canvasEl.addEventListener('pointermove', handlePointerMove);
    canvasEl.addEventListener('pointerenter', updateEraserCursor);
    canvasEl.addEventListener('pointerleave', handlePointerLeave);
    canvasEl.addEventListener('pointerup', removeBrushRing);
    canvasEl.addEventListener('pointercancel', removeBrushRing);
    canvasEl.addEventListener('lostpointercapture', removeBrushRing);
    return () => {
      canvasEl.removeEventListener('pointerdown', handlePointerDown);
      canvasEl.removeEventListener('pointermove', handlePointerMove);
      canvasEl.removeEventListener('pointerenter', updateEraserCursor);
      canvasEl.removeEventListener('pointerleave', handlePointerLeave);
      canvasEl.removeEventListener('pointerup', removeBrushRing);
      canvasEl.removeEventListener('pointercancel', removeBrushRing);
      canvasEl.removeEventListener('lostpointercapture', removeBrushRing);
      if (ringMoveFrame !== null) cancelAnimationFrame(ringMoveFrame);
    };
  });

  $effect(() => {
    if (toolState.brush === 'eraser') brushRings = {};
    else hideEraserCursor();
  });
</script>

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

<style>
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
</style>

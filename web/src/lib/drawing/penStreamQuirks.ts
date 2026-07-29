// iOS/WebKit can silently merge a fast tap-then-drag into one pointer stream
// (see engine.ts's restartStrokeIfResumed for the sibling merge case). Split
// out of engine.ts so the down-less event sequences below can be unit-tested
// without a canvas; the adopter still needs to reach into the host engine's
// pointer/canvas state and its stroke-start action, so those are taken as
// injected dependencies rather than closed over directly.

export interface PenStreamAdopterDeps {
  canvas: () => HTMLCanvasElement;
  isTracked: (pointerId: number) => boolean;
  adopt: (e: PointerEvent) => void;
}

// The subset of engine.ts's window-scoped `listen` helper this module needs:
// register a capture-phase window listener for one of the four pointer event
// types the quirk tracks.
export type ListenWindowFn = (
  type: 'pointerdown' | 'pointerup' | 'pointercancel' | 'pointermove',
  handler: (e: PointerEvent) => void,
  capture: boolean
) => void;

export function createPenStreamAdopter(deps: PenStreamAdopterDeps) {
  // Every pointerdown actually delivered anywhere in the document, until its
  // up/cancel arrives. A pen contact stream whose id is missing here never got
  // a pointerdown at all — the WebKit merged-stream signature — which is what
  // licenses adoption below without stealing pointers that legitimately began
  // on a UI control (drag-to-clear's uncaptured drag, the color picker's
  // captured drag, a slide off a swatch).
  const liveDownIds = new Set<number>();
  const trackPointerDown = (e: PointerEvent) => liveDownIds.add(e.pointerId);
  const trackPointerLift = (e: PointerEvent) => liveDownIds.delete(e.pointerId);

  // The WebKit merge quirk of POINTER_RESUME_GAP_MS, for a stream that began
  // on a UI control: a fast pen tap on e.g. a color swatch merged with the
  // following stroke drops the intervening pointerup + pointerdown, so the
  // stroke arrives as bare pointermoves — a down-less contact stream. Hover
  // moves (buttons === 0) never match, and touch keeps its 100ms
  // color-change debounce precisely to absorb this kind of tap fallout.
  function isOrphanPenContact(e: PointerEvent): boolean {
    return e.pointerType === 'pen' && e.buttons !== 0 && !liveDownIds.has(e.pointerId);
  }

  // Pens get no implicit capture, so an orphaned stream's moves usually
  // hit-test onto the canvas (engine.ts's draw() adopts those directly) — but
  // WebKit can also keep delivering them to the control the merged stream
  // started on. This window-level listener catches that flavor: an orphaned
  // pen contact move physically over exposed canvas (elementFromPoint, so an
  // open picker or a floating control still wins) becomes the stroke start,
  // and startDrawing's setPointerCapture retargets the rest of the stream to
  // the canvas.
  function adoptStrayPenStream(e: PointerEvent) {
    if (e.target === deps.canvas() || deps.isTracked(e.pointerId)) return;
    if (!isOrphanPenContact(e)) return;
    if (document.elementFromPoint(e.clientX, e.clientY) !== deps.canvas()) return;
    deps.adopt(e);
  }

  function registerWindowListeners(listen: ListenWindowFn): void {
    listen('pointerdown', trackPointerDown, true);
    listen('pointerup', trackPointerLift, true);
    listen('pointercancel', trackPointerLift, true);
    listen('pointermove', adoptStrayPenStream, true);
  }

  function reset(): void {
    liveDownIds.clear();
  }

  return { isOrphanPenContact, registerWindowListeners, reset };
}

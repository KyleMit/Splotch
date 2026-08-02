// iOS/WebKit can omit the pointerdown that should start a canvas pen stream,
// both when it merges a fast tap-then-drag and when a still-down Pencil returns
// after leaving the screen edge. Split out of engine.ts so those event
// sequences can be unit-tested without a canvas; the adopter still needs to
// reach into the host engine's pointer/canvas state and its stroke-start
// action, so those are taken as injected dependencies rather than closed over
// directly.

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
  const canvasExitIds = new Set<number>();
  const trackPointerDown = (e: PointerEvent) => {
    liveDownIds.add(e.pointerId);
    canvasExitIds.delete(e.pointerId);
  };
  const forgetPointer = (pointerId: number) => {
    liveDownIds.delete(pointerId);
    canvasExitIds.delete(pointerId);
  };
  const trackPointerLift = (e: PointerEvent) => {
    forgetPointer(e.pointerId);
  };

  // A missing pointerdown licenses adoption only for a pen whose tip is down.
  // Most such streams have no live down anywhere; screen-edge re-entry is the
  // exception, licensed by trackCanvasExit before the engine closes the old
  // stroke. Touch keeps its 100ms color-change debounce for tap fallout.
  function isOrphanPenContact(e: PointerEvent): boolean {
    return (
      e.pointerType === 'pen' &&
      e.buttons !== 0 &&
      (!liveDownIds.has(e.pointerId) || canvasExitIds.has(e.pointerId))
    );
  }

  // WebKit can end a canvas stroke with pointerout at the screen edge, then
  // return the still-down Pencil under the same pointer id without another
  // pointerdown. Only a contact the engine still owns at the exit is eligible:
  // the isTracked gate excludes a pen drag that began on a UI control before
  // it reaches canvasExitIds. Once an id is in that set, liveDownIds no longer
  // excludes it from the orphan predicate.
  function trackCanvasExit(e: PointerEvent): void {
    if (e.pointerType !== 'pen' || !deps.isTracked(e.pointerId)) return;
    canvasExitIds.add(e.pointerId);
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
    canvasExitIds.clear();
  }

  return { forgetPointer, isOrphanPenContact, registerWindowListeners, reset, trackCanvasExit };
}

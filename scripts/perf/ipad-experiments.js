/* eslint-disable */
// BROWSER CONSOLE SNIPPET — runtime A/B kill-switches for the "first pen stroke
// after a color tap doesn't show" bug. Paste into the Safari Web Inspector
// console attached to the iPad (like scripts/perf/ipad-recorder.js).
//
// OUTCOME (July 2026): root cause confirmed on-device as iPadOS SCRIBBLE —
// disabling it in Settings fixed every variant, and 'touchmovePrevent' fixed
// the canvas-tap case. The shipped fix cancels stylus touch streams on the
// canvas (engine.ts) and the palette (actions/scribbleGuard.ts). This snippet
// stays as the map of what was ruled out along the way.
//
// Why these candidates: schema-3 recordings + a Web Inspector timeline export
// proved the "lost" strokes are painted into the canvas backing store (pixel
// probes), committed to the undo log, AND present live in WebKit's own
// composited frames (timeline screenshots) — yet the glass shows nothing. The
// wedge is below WebKit, in the iPadOS display pipeline, and the failure window
// (strokes starting ≤ ~440ms after the tap fail; ≥ ~510ms work) matches the
// 0.45s selection-ring animation on the swatch. Each toggle neutralizes one
// tap-triggered effect at runtime so one device session can pinpoint the
// trigger without rebuilds.
//
// Usage:
//   __exp.set('noRing')                  // kill ONLY the ring-expand animation
//   __exp.set('noRing', 'noTransitions') // combine toggles
//   __exp.set()                          // restore everything
//   __exp.status()                       // what's active
//
// Toggles:
//   noRing           .color-swatch::before ring-expand animation (0.45s)
//   noTransitions    swatch transition:all 0.2s + :active scale bounce
//   noSelectionRing  the persistent selection-ring box-shadow (inline style)
//   noPreventDefault the app's e.preventDefault() on pen taps in the palette:
//                    the REAL event is intercepted (stopImmediatePropagation)
//                    and a synthetic clone is re-dispatched so the app handlers
//                    still run — but their preventDefault() lands on the inert
//                    clone, leaving the trusted event's native processing
//                    untouched. Tests whether preventDefault-on-pen-tap is what
//                    arms the display freeze.
//   nudgeCanvas      forces a compositor commit on the canvas every frame from
//                    pen-down until 800ms after pen-up (opacity 0.999 flicker).
//                    Doesn't remove the trigger — tests whether the frozen
//                    glass can be forced to catch up (a viable workaround).
//   touchmovePrevent non-passive touchstart/touchmove listeners on the canvas
//                    calling preventDefault(). The documented fix for iPadOS
//                    SCRIBBLE swallowing Apple Pencil strokes in Safari
//                    (mikepk.com/2020/10/iOS-safari-scribble-bug): Safari fires
//                    touch events alongside pointer events for the Pencil, and
//                    cancelling the touch stream is what stops the system
//                    handwriting recognizer from claiming the stroke. Pointer-
//                    event preventDefault (which the engine already does) is
//                    known NOT to help.
//
// Ruled out on-device already: noRing/noTransitions/noSelectionRing/noFocus
// (noFocus disabled focusCanvas()'s canvas.focus() after a color tap; that call
// was a Jan-2026 fix attempt for this very bug and has since been deleted from
// the app as dead code, so the toggle is gone too),
// noPreventDefault, nudgeCanvas (bug reproduces with each; finger is immune;
// ANY pen tap — even on the canvas itself — poisons a stroke started ≤~450ms
// later, and the lost ink never appears).
//
// Also test (no snippet): Settings → Apple Pencil → Scribble → OFF. If the bug
// disappears, Scribble is confirmed as the culprit.
(() => {
  if (window.__exp) {
    console.warn('Experiments already loaded. Use __exp.set(...) / __exp.status().');
    return;
  }
  const canvas = document.getElementById('drawingCanvas');

  const CSS = {
    noRing: `.color-swatch::before { animation: none !important; }`,
    noTransitions: `.color-swatch { transition: none !important; }
.color-swatch:active { transform: none !important; }`,
    noSelectionRing: `.color-swatch { box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2) !important; }`,
  };

  let style = document.getElementById('__exp-style');
  if (!style) {
    style = document.createElement('style');
    style.id = '__exp-style';
    document.head.appendChild(style);
  }

  let active = [];

  // noPreventDefault: swallow the trusted pen tap before the palette's handlers
  // (which preventDefault it) and hand them an inert synthetic clone instead.
  const CLONE = Symbol('expClone');
  const reDispatch = (e) => {
    if (!active.includes('noPreventDefault')) return;
    if (!e.isTrusted || e.pointerType !== 'pen') return;
    if (!(e.target instanceof Element) || !e.target.closest('.color-palette')) return;
    e.stopImmediatePropagation();
    const clone = new PointerEvent(e.type, {
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      isPrimary: e.isPrimary,
      clientX: e.clientX,
      clientY: e.clientY,
      buttons: e.buttons,
      pressure: e.pressure,
      bubbles: true,
      cancelable: true,
    });
    clone[CLONE] = true;
    e.target.dispatchEvent(clone);
  };
  for (const type of ['pointerdown', 'pointerup', 'pointercancel']) {
    addEventListener(type, reDispatch, { capture: true });
  }

  // nudgeCanvas: keep forcing compositor commits on the canvas while a pen
  // stroke is live and for 800ms after it ends.
  let nudgeUntil = 0;
  let nudging = false;
  const nudgeLoop = () => {
    if (!canvas) return;
    if (performance.now() > nudgeUntil && nudgeUntil !== Infinity) {
      canvas.style.opacity = '';
      nudging = false;
      return;
    }
    canvas.style.opacity = canvas.style.opacity === '0.999' ? '1' : '0.999';
    requestAnimationFrame(nudgeLoop);
  };
  const onPenDown = (e) => {
    if (!active.includes('nudgeCanvas') || e.pointerType !== 'pen' || !e.isTrusted) return;
    nudgeUntil = Infinity;
    if (!nudging) {
      nudging = true;
      requestAnimationFrame(nudgeLoop);
    }
  };
  const onPenUp = (e) => {
    if (!active.includes('nudgeCanvas') || e.pointerType !== 'pen' || !e.isTrusted) return;
    nudgeUntil = performance.now() + 800;
  };
  addEventListener('pointerdown', onPenDown, { capture: true, passive: true });
  addEventListener('pointerup', onPenUp, { capture: true, passive: true });
  addEventListener('pointercancel', onPenUp, { capture: true, passive: true });

  // touchmovePrevent: cancel the parallel touch stream so Scribble lets go.
  const onTouch = (e) => {
    if (active.includes('touchmovePrevent')) e.preventDefault();
  };
  if (canvas) {
    canvas.addEventListener('touchstart', onTouch, { passive: false });
    canvas.addEventListener('touchmove', onTouch, { passive: false });
  }

  const VALID = [...Object.keys(CSS), 'noPreventDefault', 'nudgeCanvas', 'touchmovePrevent'];
  window.__exp = {
    set(...toggles) {
      const bad = toggles.filter((t) => !VALID.includes(t));
      if (bad.length) {
        console.error('Unknown toggle(s):', bad, '— valid:', VALID);
        return;
      }
      active = toggles;
      style.textContent = toggles
        .filter((t) => t in CSS)
        .map((t) => CSS[t])
        .join('\n');
      if (!toggles.includes('nudgeCanvas') && canvas) canvas.style.opacity = '';
      this.status();
    },
    status() {
      console.log(active.length ? `active: ${active.join(', ')}` : 'all effects restored (baseline)');
      return active.slice();
    },
  };
  console.log(
    '● Experiments ready. Next round:\n' +
      "  __exp.set('touchmovePrevent')   // cancel the touch stream — the documented Scribble fix\n" +
      '  __exp.set()                     // baseline\n' +
      'Also try: Settings → Apple Pencil → Scribble → OFF (no snippet needed).'
  );
})();

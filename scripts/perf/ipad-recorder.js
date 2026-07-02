/* eslint-disable */
// BROWSER CONSOLE SNIPPET — not a Node script. Paste into the Safari Web
// Inspector console attached to the iPad running the REAL app (e.g.
// http://<mac-lan-ip>:4173/). It records your actual finger input — every
// pointerdown/move/up on the canvas, plus the UI actions it can recognize
// (color, stroke size, eraser, undo, clear) — into a JSON recording you can
// replay through the perf harness (`npm run perf:replay`). That gives the harness
// REAL stroke data (real op counts, real pacing) instead of synthetic squiggles.
//
// Workflow:
//   1. [iPad] Open the app, then paste this. It starts recording immediately.
//   2. [iPad] Draw / change colors / undo with your fingers as you normally would.
//   3. [Mac]  In the Web Inspector console:  copy(__rec.json())
//      (Safari's console `copy()` puts it on the MAC clipboard — paste into a file
//       under perf-profiles/recordings/, e.g. my-session.json.)
//   4. [Mac]  npm run perf:replay -- --recording=perf-profiles/recordings/my-session.json
//
// `__rec.summary()` prints counts; `__rec.stop()` detaches the listeners.
(() => {
  if (window.__rec) {
    console.warn('Recorder already running. Use __rec.stop() / __rec.json() / __rec.summary().');
    return window.__rec;
  }
  const canvas =
    document.querySelector('#drawingCanvas') || document.querySelector('#engineCanvas');
  if (!canvas) {
    console.error('No #drawingCanvas / #engineCanvas found — open the app first.');
    return;
  }

  const t0 = performance.now();
  const events = [];
  const active = new Set(); // pointerIds that started on the canvas
  const now = () => +(performance.now() - t0).toFixed(1);
  const rect = () => canvas.getBoundingClientRect();

  const recPointer = (e) => {
    const r = rect();
    events.push({
      t: now(),
      kind: 'pointer',
      type: e.type, // pointerdown | pointermove | pointerup | pointercancel
      id: e.pointerId,
      pt: e.pointerType, // touch | pen | mouse
      x: +(e.clientX - r.left).toFixed(1),
      y: +(e.clientY - r.top).toFixed(1),
    });
  };
  const recAction = (name, value) => {
    events.push({ t: now(), kind: 'action', name, ...(value !== undefined ? { value } : {}) });
    console.log(`action: ${name}${value !== undefined ? ' = ' + value : ''}`);
  };

  const onDown = (e) => {
    if (e.target === canvas || canvas.contains(e.target)) {
      active.add(e.pointerId);
      recPointer(e);
    }
  };
  const onMove = (e) => {
    if (active.has(e.pointerId)) recPointer(e);
  };
  const onUp = (e) => {
    if (active.has(e.pointerId)) {
      recPointer(e);
      active.delete(e.pointerId);
    }
  };

  // UI actions: recognize the app's known controls so a full session replays, not
  // just the strokes. Best-effort — unrecognized taps are ignored.
  const onClick = (e) => {
    const el = e.target.closest?.(
      '.color-swatch[data-color], #eraserButton, #undoButton, #clearButton, button[aria-label^="Size "]'
    );
    if (!el) return;
    if (el.matches('.color-swatch[data-color]')) recAction('color', el.getAttribute('data-color'));
    else if (el.id === 'eraserButton')
      recAction('eraser'); // toggle
    else if (el.id === 'undoButton') recAction('undo');
    else if (el.id === 'clearButton') recAction('clear');
    else if (el.getAttribute('aria-label')?.startsWith('Size '))
      recAction('size', Number(el.getAttribute('aria-label').slice(5)));
  };

  const opts = { capture: true, passive: true };
  addEventListener('pointerdown', onDown, opts);
  addEventListener('pointermove', onMove, opts);
  addEventListener('pointerup', onUp, opts);
  addEventListener('pointercancel', onUp, opts);
  addEventListener('click', onClick, opts);

  const r = rect();
  window.__rec = {
    meta: {
      ua: navigator.userAgent,
      startedAt: new Date().toISOString(),
      viewport: { w: window.innerWidth, h: window.innerHeight },
      dpr: window.devicePixelRatio,
      renderScale: Math.min(window.devicePixelRatio || 1, 2),
      canvas: { w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
    },
    events,
    summary() {
      const pd = events.filter((e) => e.kind === 'pointer' && e.type === 'pointerdown').length;
      const moves = events.filter((e) => e.kind === 'pointer' && e.type === 'pointermove').length;
      const actions = events.filter((e) => e.kind === 'action');
      console.log(
        `${events.length} events · ${pd} pointerdowns · ${moves} moves (≈ops) · ` +
          `${actions.length} actions · ${(now() / 1000).toFixed(1)}s`
      );
      return { events: events.length, pointerdowns: pd, moves, actions: actions.length };
    },
    json() {
      return JSON.stringify({ meta: this.meta, events });
    },
    save() {
      const blob = new Blob([this.json()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `splotch-recording-${Date.now()}.json`;
      a.click();
    },
    stop() {
      removeEventListener('pointerdown', onDown, opts);
      removeEventListener('pointermove', onMove, opts);
      removeEventListener('pointerup', onUp, opts);
      removeEventListener('pointercancel', onUp, opts);
      removeEventListener('click', onClick, opts);
      console.log('Recorder stopped. Grab it with: copy(__rec.json())');
      return this.summary();
    },
  };
  console.log('● Recording. Draw with your fingers, then: __rec.stop() and copy(__rec.json())');
})();

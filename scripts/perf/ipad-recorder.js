/* eslint-disable */
// BROWSER CONSOLE SNIPPET — not a Node script. Paste into the Safari Web
// Inspector console attached to the iPad running the REAL app (e.g.
// http://<mac-lan-ip>:4173/). It records EVERY pointer event on the page —
// canvas strokes and UI-targeted events alike — plus pointer-capture
// transitions and the UI actions it can recognize (color, stroke size, eraser,
// undo, clear), into a JSON recording that serves two jobs:
//
//   • Perf replay (`npm run perf:replay`): the canvas-targeted events give the
//     harness REAL stroke data (real op counts, real pacing) instead of
//     synthetic squiggles. Replay ignores the UI-targeted events.
//   • Input-bug diagnosis: because everything is recorded with its target,
//     buttons, and pressure, the recording shows exactly what WebKit delivered —
//     e.g. an Apple Pencil stroke whose pointerdown was merged away after a
//     color-swatch tap shows up as contact pointermoves with no preceding
//     pointerdown, delivered either to the canvas or still to the swatch.
//     `__rec.diagnose()` scans for that signature and reports the targets.
//   • Output-bug diagnosis: input can arrive perfectly and the pixels still
//     vanish. Schema 3 also records what the app DID: engine.* performance
//     measures (resize/undo/commit/keyframe — PERF_MARKS=true builds only),
//     environment events (window/visualViewport resize, orientation, scroll,
//     focus, visibility) with the canvas backing-store size, and pixel PROBES —
//     a strided alpha count of the canvas at +0/+250/+1000ms after each stroke
//     ends, so a stroke that painted and was later wiped is distinguishable
//     from one that never painted.
//
// Pointer-event fields: t (ms since start) · type · id (pointerId) ·
// pt (pointerType) · x/y (canvas-relative CSS px) · b (buttons) ·
// p (pressure, pen only) · on (target descriptor — ABSENT means the canvas).
// Other kinds: mark {name, dur} · env {name, cw/ch backing px, iw/ih, vw/vh} ·
// probe {delay, alpha}.
//
// Workflow:
//   1. [iPad] Open the app, then paste this. It starts recording immediately.
//   2. [iPad] Reproduce the session — draw / change colors / undo as you would.
//   3. [Mac]  In the Web Inspector console:  __rec.stop()  then  copy(__rec.json())
//      (Safari's console `copy()` puts it on the MAC clipboard — paste into a file
//       under perf-profiles/recordings/, e.g. my-session.json.)
//   4. [Mac]  npm run perf:replay -- --recording=perf-profiles/recordings/my-session.json
//
// `__rec.summary()` prints counts; `__rec.diagnose()` hunts for dropped-input
// signatures; `__rec.stop()` detaches the listeners.
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
  const now = () => +(performance.now() - t0).toFixed(1);
  const rect = () => canvas.getBoundingClientRect();

  // Short human-readable descriptor for a non-canvas target, so the recording
  // shows WHERE WebKit delivered each event (e.g. 'button.color-swatch[#EC534E]').
  const describeTarget = (el) => {
    if (!(el instanceof Element)) return String(el);
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    else if (el.classList.length) s += `.${[...el.classList].slice(0, 2).join('.')}`;
    if (el.dataset?.color) s += `[${el.dataset.color}]`;
    return s;
  };

  // Engine activity: PERF_MARKS=true builds measure every wipe/rebuild-capable
  // operation (engine.resize, engine.undo, engine.commit, engine.keyframe…).
  // engine.draw is skipped — one per pointermove, pure noise here.
  let perfObs = null;
  try {
    perfObs = new PerformanceObserver((list) => {
      for (const en of list.getEntries()) {
        if (!en.name.startsWith('engine.') || en.name === 'engine.draw') continue;
        events.push({
          t: +(en.startTime - t0).toFixed(1),
          kind: 'mark',
          name: en.name,
          dur: +en.duration.toFixed(1),
        });
      }
    });
    perfObs.observe({ entryTypes: ['measure'] });
  } catch {}

  // Setting canvas.width/height wipes the drawing — track the backing store on
  // every event so a wipe shows up even if no resize listener of ours fired.
  const lastCanvasSize = { w: canvas.width, h: canvas.height };
  const checkCanvasSize = () => {
    if (canvas.width === lastCanvasSize.w && canvas.height === lastCanvasSize.h) return;
    recEnv('canvas-resized', { from: `${lastCanvasSize.w}x${lastCanvasSize.h}` });
    lastCanvasSize.w = canvas.width;
    lastCanvasSize.h = canvas.height;
  };

  const recEnv = (name, extra) => {
    events.push({
      t: now(),
      kind: 'env',
      name,
      cw: canvas.width,
      ch: canvas.height,
      iw: window.innerWidth,
      ih: window.innerHeight,
      ...(window.visualViewport
        ? { vw: +visualViewport.width.toFixed(1), vh: +visualViewport.height.toFixed(1) }
        : {}),
      ...(extra || {}),
    });
  };
  const onWinResize = () => (recEnv('window-resize'), checkCanvasSize());
  const onVvResize = () => (recEnv('visualViewport-resize'), checkCanvasSize());
  const onVvScroll = () => recEnv('visualViewport-scroll');
  const onOrientation = () => (recEnv('orientationchange'), checkCanvasSize());
  const onScroll = () => recEnv('window-scroll');
  const onVisibility = () => recEnv(`visibility-${document.visibilityState}`);
  const onFocusIn = (e) => recEnv('focusin', { on: describeTarget(e.target) });

  // Pixel probes: strided alpha count of the visible canvas shortly after each
  // stroke ends. A later probe LOWER than an earlier one (without erasing or
  // clearing) means something wiped painted pixels.
  const probeTimers = new Set();
  const ALPHA_STRIDE = 4 * 61;
  const alphaCount = () => {
    try {
      const c = canvas.getContext('2d');
      const { data } = c.getImageData(0, 0, canvas.width, canvas.height);
      let n = 0;
      for (let i = 3; i < data.length; i += ALPHA_STRIDE) if (data[i] > 0) n++;
      return n;
    } catch {
      return -1;
    }
  };
  const scheduleProbes = () => {
    for (const delay of [0, 250, 1000]) {
      const id = setTimeout(() => {
        probeTimers.delete(id);
        checkCanvasSize();
        events.push({ t: now(), kind: 'probe', delay, alpha: alphaCount() });
      }, delay);
      probeTimers.add(id);
    }
  };

  const recPointer = (e) => {
    checkCanvasSize();
    const r = rect();
    const ev = {
      t: now(),
      kind: 'pointer',
      type: e.type, // pointerdown | pointermove | pointerup | pointercancel
      id: e.pointerId,
      pt: e.pointerType, // touch | pen | mouse
      x: +(e.clientX - r.left).toFixed(1),
      y: +(e.clientY - r.top).toFixed(1),
      b: e.buttons,
    };
    if (e.pointerType === 'pen') ev.p = +e.pressure.toFixed(2);
    // `on` marks events the canvas did NOT receive; its absence means "canvas",
    // which is what perf:replay fires. Capture retargets events, so a captured
    // stream is attributed to its capturing element here.
    if (e.target !== canvas) ev.on = describeTarget(e.target);
    events.push(ev);
    if ((e.type === 'pointerup' || e.type === 'pointercancel') && e.target === canvas) {
      scheduleProbes();
    }
  };

  const recCapture = (e) => {
    events.push({
      t: now(),
      kind: 'capture',
      type: e.type === 'gotpointercapture' ? 'got' : 'lost',
      id: e.pointerId,
      pt: e.pointerType,
      on: describeTarget(e.target),
    });
  };

  const recAction = (name, value) => {
    events.push({ t: now(), kind: 'action', name, ...(value !== undefined ? { value } : {}) });
    console.log(`action: ${name}${value !== undefined ? ' = ' + value : ''}`);
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
  addEventListener('pointerdown', recPointer, opts);
  addEventListener('pointermove', recPointer, opts);
  addEventListener('pointerup', recPointer, opts);
  addEventListener('pointercancel', recPointer, opts);
  addEventListener('gotpointercapture', recCapture, opts);
  addEventListener('lostpointercapture', recCapture, opts);
  addEventListener('click', onClick, opts);
  addEventListener('resize', onWinResize);
  addEventListener('orientationchange', onOrientation);
  addEventListener('scroll', onScroll);
  addEventListener('focusin', onFocusIn);
  document.addEventListener('visibilitychange', onVisibility);
  window.visualViewport?.addEventListener('resize', onVvResize);
  window.visualViewport?.addEventListener('scroll', onVvScroll);
  const detach = () => {
    removeEventListener('pointerdown', recPointer, opts);
    removeEventListener('pointermove', recPointer, opts);
    removeEventListener('pointerup', recPointer, opts);
    removeEventListener('pointercancel', recPointer, opts);
    removeEventListener('gotpointercapture', recCapture, opts);
    removeEventListener('lostpointercapture', recCapture, opts);
    removeEventListener('click', onClick, opts);
    removeEventListener('resize', onWinResize);
    removeEventListener('orientationchange', onOrientation);
    removeEventListener('scroll', onScroll);
    removeEventListener('focusin', onFocusIn);
    document.removeEventListener('visibilitychange', onVisibility);
    window.visualViewport?.removeEventListener('resize', onVvResize);
    window.visualViewport?.removeEventListener('scroll', onVvScroll);
    perfObs?.disconnect();
    for (const id of probeTimers) clearTimeout(id);
    probeTimers.clear();
  };

  const r = rect();
  window.__rec = {
    meta: {
      schema: 3,
      ua: navigator.userAgent,
      startedAt: new Date().toISOString(),
      viewport: { w: window.innerWidth, h: window.innerHeight },
      dpr: window.devicePixelRatio,
      renderScale: Math.min(window.devicePixelRatio || 1, 2),
      canvas: { w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
    },
    events,
    summary() {
      const pointers = events.filter((e) => e.kind === 'pointer');
      const onCanvas = pointers.filter((e) => !e.on);
      const pd = onCanvas.filter((e) => e.type === 'pointerdown').length;
      const moves = onCanvas.filter((e) => e.type === 'pointermove').length;
      const ui = pointers.length - onCanvas.length;
      const actions = events.filter((e) => e.kind === 'action');
      console.log(
        `${events.length} events · canvas: ${pd} pointerdowns + ${moves} moves (≈ops) · ` +
          `${ui} UI-targeted pointer events · ${actions.length} actions · ` +
          `${(now() / 1000).toFixed(1)}s`
      );
      return {
        events: events.length,
        pointerdowns: pd,
        moves,
        uiPointer: ui,
        actions: actions.length,
      };
    },
    // Scan for dropped-input signatures: contact moves (buttons ≠ 0) for a
    // pointerId with no live pointerdown ANYWHERE — i.e. WebKit merged a
    // tap-then-draw into one stream and dropped the down. Each orphan run tallies
    // WHERE its moves were delivered (canvas vs a retained UI target), which is
    // the fact that decides how the engine has to recover the stroke.
    diagnose() {
      const down = new Set();
      const orphans = [];
      const runs = new Map();
      const endRun = (key) => {
        const r = runs.get(key);
        if (r) {
          orphans.push(r);
          runs.delete(key);
        }
      };
      for (const e of events) {
        if (e.kind !== 'pointer') continue;
        const key = `${e.pt}:${e.id}`;
        if (e.type === 'pointerdown') {
          endRun(key);
          down.add(key);
        } else if (e.type === 'pointerup' || e.type === 'pointercancel') {
          endRun(key);
          down.delete(key);
        } else if (e.type === 'pointermove' && e.b !== 0 && !down.has(key)) {
          let r = runs.get(key);
          if (!r) {
            r = { key, pt: e.pt, tStart: e.t, tEnd: e.t, moves: 0, targets: {} };
            runs.set(key, r);
          }
          r.moves++;
          r.tEnd = e.t;
          const target = e.on || 'canvas';
          r.targets[target] = (r.targets[target] || 0) + 1;
        }
      }
      for (const key of [...runs.keys()]) endRun(key);
      if (orphans.length === 0) {
        console.log('No down-less contact streams — every stroke got its pointerdown.');
      } else {
        for (const o of orphans) {
          const where = Object.entries(o.targets)
            .map(([el, n]) => `${el} ×${n}`)
            .join(', ');
          console.log(
            `⚠ ${o.pt} contact stream WITHOUT pointerdown: ${o.moves} moves ` +
              `(${o.tStart.toFixed(0)}–${o.tEnd.toFixed(0)}ms), delivered to: ${where} — ` +
              `WebKit merged/dropped the down.`
          );
        }
      }

      // Output side: a probe alpha LOWER than the previous probe means painted
      // pixels vanished (expected only after an eraser stroke, undo, or clear).
      const probes = events.filter((e) => e.kind === 'probe' && e.alpha >= 0);
      const wipes = [];
      for (let i = 1; i < probes.length; i++) {
        const prev = probes[i - 1];
        const cur = probes[i];
        if (cur.alpha < prev.alpha - 5) {
          wipes.push({ from: prev, to: cur });
          console.log(
            `⚠ canvas alpha dropped ${prev.alpha} → ${cur.alpha} between ` +
              `${prev.t.toFixed(0)}ms and ${cur.t.toFixed(0)}ms — painted pixels vanished ` +
              `(fine if that was an eraser stroke, undo, or clear).`
          );
        }
      }
      const marks = events.filter((e) => e.kind === 'mark');
      if (marks.length === 0) {
        console.log(
          'No engine.* measures seen — non-PERF_MARKS build? Engine activity is invisible.'
        );
      } else {
        for (const m of marks) {
          if (m.name !== 'engine.commit') {
            console.log(`ℹ ${m.name} at ${m.t.toFixed(0)}ms (${m.dur}ms)`);
          }
        }
      }
      for (const e of events) {
        if (e.kind === 'env' && (e.name === 'canvas-resized' || e.name.includes('resize'))) {
          console.log(`ℹ env ${e.name} at ${e.t.toFixed(0)}ms (canvas ${e.cw}x${e.ch})`);
        }
      }
      return { orphans, wipes };
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
      detach();
      console.log('Recorder stopped. Grab it with: copy(__rec.json())');
      this.diagnose();
      return this.summary();
    },
  };
  console.log(
    '● Recording every pointer event. Reproduce the session, then: __rec.stop() and copy(__rec.json())'
  );
})();

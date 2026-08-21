/* eslint-disable */
// BROWSER PROBE — not a Node script. Injected into the REAL app (`/`) on a
// physical iPad by `npm run perf:ios:webkit:frames` (tools/perf/ios/capture-webkit-frames.mjs),
// and pasteable by hand into a Web Inspector console attached to the same page.
//
// WHY THIS EXISTS: the /dev/engine gates run (`npm run perf:ios:webkit:gates`) measures
// engine-internal main-thread spans on a bare canvas and passes every ADR-0066
// gate on hardware, while the real screen visibly lags. Everything the gates
// cannot see lives on the real screen — the line-art overlay's blend
// recomposite, PointerHalos' per-move DOM writes, per-stroke Svelte reactivity,
// and the compositor cost of the real paper geometry — and none of it makes an
// `engine.*` measure larger. This probe measures the screen instead of the
// engine: frame pacing, how late input arrives, and how late paint follows it.
//
// It is a RECORDER, not an analyzer. It appends numeric rows and hands them back
// verbatim; every percentile, verdict and comparison is computed in Node by
// analyze-frame-capture.mjs, where it can be unit-tested.
//
// Six tables come back (all times in ms, all in the page's time origin so they
// are directly comparable). The numeric rows are read by POSITION in
// real-screen-stats.mjs, so these layouts and its column constants move together:
//
//   frames[]   [t, dt, contact]                  one row per rAF callback
//   events[]   [stamp, at, type, id, buttons, coalesced, onCanvas, kind,
//               trusted, pressure, width, height, coalescedFirst, coalescedLast]
//              `stamp` is the event's own timestamp (when the input happened),
//              `at` is performance.now() inside the handler (when the page got
//              to it) — their difference is INPUT QUEUE DELAY, the main-thread
//              congestion a child feels as lag with no dropped frame anywhere.
//              `kind` is the pointer type (0 touch, 1 pen, 2 mouse).
//   measures[] [start, dur, nameIndex]            engine.* performance measures
//   history[]  [at, undoEntries, livePatchEntries, patchBytes, baseRasters,
//               baseRasterBytes, historyLength]
//              one row per finger-lift, from the read-only undo-history seam
//   liftLatencies[] [at, waitedMs, phaseIndex]    finger-up to halo-gone
//   phases[]   {key, suppress, paperActive, …}   which condition owned which span
//
// Frame-vs-JS attribution falls out of the join: a frame interval with a 25 ms
// delta and 1 ms of engine.* inside it spent 24 ms somewhere the engine marks
// structurally cannot see.
//
// Modes:
//   hand mode      — an on-device HUD walks a human through each phase; a phase
//                    ends once it has banked enough FINGER-DOWN time, so phases
//                    are comparable even though the pace is human.
//   synthetic mode — __probeDrive generates pointer input (one per frame, or
//                    timer-paced at __probeDriveHz), so a run needs no hand.
//
// Config globals, all optional, assigned by the driver before injection:
//   __probePhases      'page,blank' | phase spec array (see PHASES)
//   __probeContactMs   banked contact time each phase needs (default 25 s)
//   __probeHud         false to suppress the on-device HUD
//   __probeDrive       'long' | 'short' | 'mixed' — run the synthetic hand
//   __probeDriveHz     moves per second for the synthetic hand (else one/frame)
//   __probePointerType 'touch' | 'pen' for synthetic events
//   __probeBrush       'pen' | 'crayon' | 'magic' | 'eraser' to select first
(() => {
  if (window.__probe) {
    console.warn('Probe already running — call __probe.stop() first.');
    return;
  }

  const canvas = document.querySelector('#drawingCanvas');
  if (!canvas) {
    console.error(
      'No #drawingCanvas — this probe belongs on the real app at /, not on /dev/engine.'
    );
    return;
  }

  // Selectors into the app's own DOM. The probe cannot import the app's
  // constants, so tools/perf/tests/real-screen.test.mjs asserts every one of
  // them still matches its component — a silent rename here would report a
  // suppression as applied while measuring nothing.
  const PAPER_VIEW_SELECTOR = '.paper-view';
  const HALO_SELECTORS = '.brush-ring, .eraser-bubble';
  const COLORING_BOOK_BUTTON = '#coloringBookButton';
  const ACTIVE_PAGE_CLEAR_BUTTON = '[aria-label^="Clear active coloring page:"]';
  // The picker shows books first and a book's pages only after one is picked, so
  // loading a page unattended is two taps. Matched on the aria-label suffix the
  // component builds per book/page rather than on a nth-child position.
  const BOOK_TILE = 'button[aria-label$="coloring book"]';
  const PAGE_TILE = 'button[aria-label$="coloring page"]';
  const COLORING_OVERLAY_ID = 'coloringOverlay';

  const DEFAULT_CONTACT_MS = 25_000;
  // A phase that has banked something real and then sees no drawing for this
  // long publishes what it has instead of waiting out the driver's budget: the
  // operator walked away, and a partial phase is worth more than a timeout.
  const IDLE_ABANDON_MS = 60_000;
  const IDLE_ABANDON_FLOOR = 0.25;
  // The HUD's countdown is rounded this coarsely on purpose: every text mutation
  // is a repaint, and a repaint damages the very blend layer whose cost some
  // phases exist to isolate. Half-second granularity reads as live to a human
  // and costs two repaints a second against a per-input-event nudge.
  const HUD_TICK_MS = 500;
  const POINTER_TYPES = { pointerdown: 0, pointermove: 1, pointerup: 2, pointercancel: 3 };
  const POINTER_KINDS = { touch: 0, pen: 1, mouse: 2 };
  // Which brush is selected changes what a pointermove costs: the crayon runs two
  // extra full-size overlay canvases with their own blend modes, and the magic
  // brush's ring is a conic gradient behind a radial mask. A capture that does
  // not say which brush it used cannot be compared to one that used another.
  const BRUSH_BUTTONS = {
    pen: '#penBrushButton',
    crayon: '#crayonBrushButton',
    magic: '#magicBrushButton',
    eraser: '#eraserButton',
  };

  // Each phase names the paper state it needs and what it suppresses. Order
  // minimizes paper switching for the human: blank first, then everything that
  // needs a page loaded.
  // Nothing clears the paper between phases, so ink and undo history accumulate
  // across the whole run — which is a confound for the suppression comparison and
  // the very effect the reported lag scales with. `page-again` repeats `page`
  // verbatim at the end so the drift is measured instead of assumed: whatever
  // separates the two is accumulation, and every suppression delta has to be
  // read against it.
  const PHASES = [
    { key: 'blank', paper: 'blank', suppress: [] },
    { key: 'page', paper: 'page', suppress: [] },
    { key: 'page-no-nudge', paper: 'page', suppress: ['nudge'] },
    { key: 'page-no-blend', paper: 'page', suppress: ['blend'] },
    { key: 'page-no-halos', paper: 'page', suppress: ['halos'] },
    { key: 'page-bare', paper: 'page', suppress: ['nudge', 'blend', 'halos'] },
    { key: 'page-again', paper: 'page', suppress: [] },
    // `halos` removes the halo's box entirely, which conflates two costs: the
    // element's paint, and the stacking/compositing churn of a box appearing and
    // vanishing per stroke. These two separate them — `hidden` keeps the box and
    // its layout but skips painting it; `transparent` keeps it painted and
    // composited and only makes it invisible. If only `display:none` recovers the
    // frames, the cost is the churn, not the pixels.
    { key: 'page-halos-hidden', paper: 'page', suppress: ['halos-hidden'] },
    { key: 'page-halos-transparent', paper: 'page', suppress: ['halos-transparent'] },
  ];

  const requested = window.__probePhases;
  const phaseKeys =
    typeof requested === 'string' ? requested.split(',').map((key) => key.trim()) : null;
  const plan = phaseKeys ? phaseKeys.map((key) => PHASES.find((p) => p.key === key)) : [...PHASES];
  if (plan.some((phase) => !phase)) {
    console.error(`Unknown phase in __probePhases — known: ${PHASES.map((p) => p.key).join(', ')}`);
    return;
  }
  const contactTargetMs = Number(window.__probeContactMs) || DEFAULT_CONTACT_MS;
  // Free-draw mode: a START button and then a fixed WALL-CLOCK window, instead of
  // banking finger-down time. Contact-banking measures only the stroke, and the
  // reported lag turned out to live at the finger-lift and between strokes — a
  // capture spent 8753 ms of lost time there against 2422 ms during the strokes.
  // A wall-clock window records the gaps as first-class.
  const freeDrawMs = Number(window.__probeFreeDraw) * 1000 || 0;

  const paperView = document.querySelector(PAPER_VIEW_SELECTOR);
  if (!paperView) {
    console.error(
      `No ${PAPER_VIEW_SELECTOR} in the DOM — the overlay wrapper was renamed, so the ` +
        'nudge/blend suppressions would silently measure nothing. Fix the probe selectors.'
    );
    return;
  }

  const frames = [];
  const events = [];
  const measures = [];
  const measureNames = [];
  // How the undo history is stored, sampled once per finger-lift from the
  // read-only seam `lib/boot/devHarnessSeam.ts` exposes on `/`. The reported
  // lag grows with how much has been drawn, and every stroke pushes a
  // canvas-backed dirty-rect patch (ADR-0069/0074) — this is the table that
  // says whether stall onset tracks that growth.
  const history = [];
  // Finger-up to the pointer halo actually leaving the DOM. A directly felt
  // symptom ("it takes a long time from finger up for the halo to go away and
  // the app to snap back") and a clean probe of the whole lift path: the halo is
  // removed by a Svelte state write on pointerup, so it cannot disappear until
  // the reactivity, the commit, and a rendering update have all gone through.
  const liftLatencies = [];
  const nameId = (name) => {
    const seen = measureNames.indexOf(name);
    if (seen !== -1) return seen;
    measureNames.push(name);
    return measureNames.length - 1;
  };
  const round = (value) => Math.round(value * 100) / 100;

  // ── engine.* activity ─────────────────────────────────────────────────────
  // Recorded with its own start time rather than bucketed per frame here: Node
  // joins each measure to the frame interval containing its start, which is
  // exact, whereas an observer callback's ordering against rAF is not.
  let measureObserver = null;
  try {
    measureObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.name.startsWith('engine.')) continue;
        measures.push([round(entry.startTime), round(entry.duration), nameId(entry.name)]);
      }
    });
    measureObserver.observe({ entryTypes: ['measure'] });
  } catch {
    // No PerformanceObserver for measures: frame data still stands on its own.
  }

  // ── pointer input ─────────────────────────────────────────────────────────
  // "Contact" means a live drawing stream, and it is derived from the MOVES, not
  // only from a pointerdown: WebKit merges a tap-then-draw into one stream and
  // drops the down entirely (the down-less pen stream `penStreamQuirks.ts`
  // exists to adopt). A pointerdown-only definition banks nothing at all for
  // such a stroke while ink is visibly painting — which is exactly how this
  // probe failed its first device run.
  const drawingPointers = new Set();

  // Identity would be enough today, but a re-queried element keeps the probe
  // honest if the canvas is ever replaced under it, and `closest` covers a
  // touch that lands on something the canvas contains.
  const onCanvasTarget = (target) =>
    target === canvas ||
    (target instanceof Element && (target.id === canvas.id || !!target.closest(`#${canvas.id}`)));

  const recordPointer = (event) => {
    const onCanvas = onCanvasTarget(event.target);
    const type = POINTER_TYPES[event.type];
    if (onCanvas && (type === 0 || (type === 1 && event.buttons !== 0))) {
      drawingPointers.add(event.pointerId);
    }
    if (type === 2 || type === 3) drawingPointers.delete(event.pointerId);
    // getCoalescedEvents is how many hardware samples WebKit merged into this
    // one dispatch — the difference between input the page never saw and input
    // it saw late.
    let coalescedEvents = [];
    try {
      coalescedEvents = event.getCoalescedEvents?.() ?? [];
    } catch {
      coalescedEvents = [];
    }
    const coalescedFirst = coalescedEvents[0];
    const coalescedLast = coalescedEvents.at(-1);
    events.push([
      round(event.timeStamp),
      round(performance.now()),
      type,
      event.pointerId,
      event.buttons,
      coalescedEvents.length,
      onCanvas ? 1 : 0,
      // An Apple Pencil is a different input path from a finger (higher sample
      // rate, pressure, and the merged-stream quirk penStreamQuirks.ts adopts).
      // The first capture could not say which one it recorded, which left the
      // biggest difference between it and a synthetic run unmeasured.
      POINTER_KINDS[event.pointerType] ?? -1,
      event.isTrusted ? 1 : 0,
      round(event.pressure),
      round(event.width),
      round(event.height),
      coalescedFirst ? round(coalescedFirst.timeStamp) : -1,
      coalescedLast ? round(coalescedLast.timeStamp) : -1,
    ]);
    if ((type === 2 || type === 3) && onCanvas) onLift(event);
  };

  // Sampled at the lift rather than per frame: getUndoDebug walks tiled
  // history, so calling it on the hot path would be measuring the probe.
  const sampleHistory = (at) => {
    const debug = window.__drawingDebug?.getUndoDebug?.();
    if (!debug) return;
    history.push([
      round(at),
      debug.snapshots,
      debug.liveRasters,
      debug.rasterBytes,
      debug.baseRasters ?? -1,
      debug.baseRasterBytes ?? -1,
      debug.historyLength ?? -1,
    ]);
  };

  let pendingLift = null;
  const onLift = (event) => {
    // Deferred a microtask, keeping the lift's own timestamp for the row. This
    // probe listens on `window` in the CAPTURE phase while the engine's
    // `pointerup` is on the canvas in the bubble phase (engine.ts
    // registerEngineListeners) and commits synchronously — capture on an ancestor
    // always precedes the target-phase handler, so reading here directly sampled
    // the history from one lift EARLIER. A microtask runs once the whole dispatch
    // unwinds, which is after the commit.
    queueMicrotask(() => sampleHistory(event.timeStamp));
    // Only track the last pointer up: with several fingers down the halos of the
    // others are legitimately still there.
    if (drawingPointers.size === 0) pendingLift = { at: performance.now(), phase: index };
  };

  const pointerOptions = { capture: true, passive: true };
  const POINTER_EVENTS = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'];
  for (const name of POINTER_EVENTS) addEventListener(name, recordPointer, pointerOptions);

  // ── suppressions ──────────────────────────────────────────────────────────
  // Each one is CSS with `!important`, which beats the app's inline styles
  // without touching the app: `nudge` pins the wrapper's computed transform so
  // DrawingCanvas.nudgeBlendLayer's per-event translateZ epsilon no longer
  // changes a computed value (the style write still happens; the compositor
  // damage it exists to cause does not). Pinning freezes the paper transform,
  // so a phase measured under it must not rotate the device.
  const styleEl = document.createElement('style');
  styleEl.id = '__probeSuppressions';
  document.head.append(styleEl);

  const applySuppressions = (suppress) => {
    const rules = [];
    if (suppress.includes('halos')) rules.push(`${HALO_SELECTORS} { display: none !important; }`);
    if (suppress.includes('halos-hidden')) {
      rules.push(`${HALO_SELECTORS} { visibility: hidden !important; }`);
    }
    if (suppress.includes('halos-transparent')) {
      rules.push(`${HALO_SELECTORS} { opacity: 0 !important; }`);
    }
    if (suppress.includes('blend')) {
      rules.push(`${PAPER_VIEW_SELECTOR} { mix-blend-mode: normal !important; }`);
    }
    if (suppress.includes('nudge')) {
      const pinned = getComputedStyle(paperView).transform;
      rules.push(`${PAPER_VIEW_SELECTOR} { transform: ${pinned} !important; }`);
    }
    styleEl.textContent = rules.join('\n');
  };

  const paperActive = () => !paperView.hasAttribute('hidden');
  // For a page phase the ART has to be showing, not merely selected:
  // DrawingCanvas hides the <img> until the new file decodes, and the blend cost
  // being measured does not exist until it paints. Gating on the wrapper alone
  // would start a phase's clock during the decode.
  const pageArtShowing = () => {
    const img = document.getElementById(COLORING_OVERLAY_ID);
    return !!img && !!img.getAttribute('src') && !img.hasAttribute('hidden');
  };

  // ── synthetic hand (unattended mode) ──────────────────────────────────────
  // Real finger input is the fidelity reference, but it needs a human awake.
  // The synthetic hand dispatches ONE pointermove per frame — the rate WebKit
  // coalesces real touch input down to — from inside the frame loop. That is the
  // whole difference from `engine-gates.js`, which pushes an entire stroke
  // through in one blocking tick and makes every frame duration in a recording
  // meaningless (its own analyzer says so).
  //
  // What synthetic input CANNOT reproduce, and must be read from a hand-drawn
  // run instead: touch coalescing, ProMotion's input pacing, and queue delay — a
  // constructed event's timeStamp is set when the probe builds it, so
  // `at - stamp` is ~0 by construction.
  const driveShape = window.__probeDrive ?? null;
  // Moves per second. Unset drives one move per frame from the frame loop, which
  // is what a 60 Hz presentable frame can show — and which measured perfectly
  // clean on device while a real hand stalled for over a second. A real Apple
  // Pencil/finger delivers 120 Hz+ into that same 60 Hz frame, so this exists to
  // test whether the input RATE is what turns per-event work into a stall.
  // Timer-driven rather than frame-driven so each move is its own task, as real
  // input is, instead of a burst inside one callback.
  const driveHz = Number(window.__probeDriveHz) || 0;
  const SYNTHETIC_POINTER_ID = 1;
  const LONG_STROKE_MS = 4_000;
  const LONG_STROKE_GAP_MS = 150;
  const LONG_STROKE_WAVES = 6;
  const LONG_STROKE_AMPLITUDE = 0.35;
  const SHORT_STROKE_MS = 250;
  const SHORT_STROKE_GAP_MS = 90;
  const SHORT_STROKE_DAB_PX = 90;
  // One long stroke then a burst of short ones: the two shapes the lag report
  // names, alternating inside every phase so one phase covers both.
  const SHORTS_PER_BURST = 8;
  const STROKE_INSET = 0.08;
  const UI_SETTLE_MS = 350;
  const PAPER_CONTROL_TIMEOUT_MS = 10_000;
  const PAPER_CONTROL_POLL_MS = 100;
  // The pump deliberately wakes FASTER than the target rate, so the dispatch
  // condition sets the cadence rather than the timer's clamp — that is what holds
  // 8.3 ms spacing after `setTimeout(8.3)` measured 13 ms on device. Lower than
  // this buys nothing (timers clamp around here) and only spins the loop.
  const PUMP_POLL_MS = 4;

  const DRIVE_SHAPES = {
    long: [{ kind: 'long', strokeMs: LONG_STROKE_MS, gapMs: LONG_STROKE_GAP_MS }],
    short: [{ kind: 'short', strokeMs: SHORT_STROKE_MS, gapMs: SHORT_STROKE_GAP_MS }],
    mixed: [
      { kind: 'long', strokeMs: LONG_STROKE_MS, gapMs: LONG_STROKE_GAP_MS },
      ...Array.from({ length: SHORTS_PER_BURST }, () => ({
        kind: 'short',
        strokeMs: SHORT_STROKE_MS,
        gapMs: SHORT_STROKE_GAP_MS,
      })),
    ],
  };
  const driveCycle = driveShape ? DRIVE_SHAPES[driveShape] : null;
  if (driveShape && !driveCycle) {
    console.error(
      `Unknown __probeDrive "${driveShape}" — known: ${Object.keys(DRIVE_SHAPES).join(', ')}`
    );
    return;
  }

  // Deterministic, so two runs of the same shape draw the same strokes and their
  // numbers are comparable.
  let randomState = 1;
  const nextRandom = () => {
    randomState = (randomState * 1103515245 + 12345) % 2147483648;
    return randomState / 2147483648;
  };

  const drawArea = () => {
    const box = (paperActive() ? paperView : canvas).getBoundingClientRect();
    return {
      x: box.left + box.width * STROKE_INSET,
      y: box.top + box.height * STROKE_INSET,
      w: box.width * (1 - 2 * STROKE_INSET),
      h: box.height * (1 - 2 * STROKE_INSET),
    };
  };

  const strokePoint = (progress, stroke) => {
    const { area } = stroke;
    if (stroke.kind === 'short') {
      return {
        x:
          area.x + area.w * stroke.originX + Math.cos(progress * Math.PI * 2) * SHORT_STROKE_DAB_PX,
        y: area.y + area.h * stroke.originY + progress * SHORT_STROKE_DAB_PX,
      };
    }
    return {
      x: area.x + area.w * progress,
      y:
        area.y +
        area.h *
          (0.5 +
            LONG_STROKE_AMPLITUDE * Math.sin(progress * Math.PI * LONG_STROKE_WAVES + stroke.seed)),
    };
  };

  // `pen` is selectable because an Apple Pencil is what the lag was reported
  // with, and the app treats a pen stream differently (penStreamQuirks.ts) than a
  // finger.
  const drivePointerType = window.__probePointerType ?? 'touch';
  const dispatchPointer = (type, x, y, buttons) => {
    canvas.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        pointerId: SYNTHETIC_POINTER_ID,
        pointerType: drivePointerType,
        isPrimary: true,
        buttons,
        pressure: buttons ? 0.5 : 0,
        clientX: x,
        clientY: y,
        width: 30,
        height: 30,
      })
    );
  };

  // The Brush Menu is a hidden `<div>`, not a modal, so its buttons are in the DOM
  // whether or not the flyout is open — one click on the brush is enough. Opening
  // the flyout first is not just unnecessary: it leaves the panel in a state where
  // the next tap closes the flyout instead of reaching the coloring-book button,
  // which stalled the whole setup.
  const driveBrush = window.__probeBrush ?? null;
  async function selectBrush(brush) {
    const target = BRUSH_BUTTONS[brush];
    if (!target) {
      console.error(
        `Unknown __probeBrush "${brush}" — known: ${Object.keys(BRUSH_BUTTONS).join(', ')}`
      );
      return;
    }
    if (!clickSelector(target)) console.error(`No ${target} — cannot select a brush unattended.`);
    await settle(UI_SETTLE_MS);
  }

  // A synthetic pointerId has no real capture target, so the engine's
  // setPointerCapture would throw inside its own pointerdown handler and abort
  // the stroke it was starting. Wrapped rather than replaced, so real input from
  // a hand still gets real capture.
  const capturedMethods = [];
  if (driveCycle) {
    for (const name of ['setPointerCapture', 'releasePointerCapture']) {
      const original = canvas[name];
      capturedMethods.push([name, original]);
      canvas[name] = function guarded(id) {
        try {
          return original.call(this, id);
        } catch {
          return undefined;
        }
      };
    }
  }

  const clickSelector = (selector) => {
    const el = document.querySelector(selector);
    el?.click();
    return !!el;
  };
  const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitForCondition = async (condition) => {
    const deadline = performance.now() + PAPER_CONTROL_TIMEOUT_MS;
    while (performance.now() < deadline) {
      const result = condition();
      if (result) return result;
      await settle(PAPER_CONTROL_POLL_MS);
    }
    return null;
  };

  async function coloringPageTile() {
    let pageTile = document.querySelector(PAGE_TILE);
    if (pageTile) return pageTile;

    let bookTile = document.querySelector(BOOK_TILE);
    if (!bookTile) {
      if (!clickSelector(COLORING_BOOK_BUTTON)) return null;
      const firstControl = await waitForCondition(
        () => document.querySelector(PAGE_TILE) ?? document.querySelector(BOOK_TILE)
      );
      if (!firstControl) return null;
      pageTile = document.querySelector(PAGE_TILE);
      bookTile = document.querySelector(BOOK_TILE);
    }

    if (pageTile) return pageTile;
    bookTile.click();
    return waitForCondition(() => document.querySelector(PAGE_TILE));
  }

  // Drives the app's own coloring-book UI by selector rather than reaching into
  // its state, so the synthetic path exercises what a child's tap does — and the
  // app needs no probe-only seam to make a page loadable.
  let paperFixInFlight = false;
  async function fixPaper(need) {
    paperFixInFlight = true;
    try {
      if (need === 'blank') {
        if (!clickSelector(ACTIVE_PAGE_CLEAR_BUTTON)) {
          console.error(`No ${ACTIVE_PAGE_CLEAR_BUTTON} — cannot clear paper unattended.`);
          return;
        }
        await waitForCondition(() => !paperActive());
        return;
      }

      const pageTile = await coloringPageTile();
      if (!pageTile) {
        console.error('Coloring picker did not expose a page before the setup timeout.');
        return;
      }
      pageTile.click();
      await waitForCondition(() => paperActive() && pageArtShowing());
    } finally {
      paperFixInFlight = false;
    }
  }

  let hand = null;
  let handStep = 0;
  let nextStrokeAt = 0;

  const startHandStroke = (ts) => {
    const shape = driveCycle[handStep % driveCycle.length];
    handStep++;
    hand = {
      ...shape,
      startedAt: ts,
      area: drawArea(),
      seed: nextRandom() * Math.PI * 2,
      originX: 0.15 + nextRandom() * 0.7,
      originY: 0.15 + nextRandom() * 0.7,
    };
    const { x, y } = strokePoint(0, hand);
    dispatchPointer('pointerdown', x, y, 1);
  };

  const endHandStroke = (ts) => {
    const { x, y } = strokePoint(1, hand);
    dispatchPointer('pointerup', x, y, 0);
    nextStrokeAt = ts + hand.gapMs;
    hand = null;
  };

  let brushSelected = false;
  const stepHand = (ts) => {
    if (paperFixInFlight) return;
    if (driveBrush && !brushSelected) {
      brushSelected = true;
      paperFixInFlight = true;
      selectBrush(driveBrush).finally(() => {
        paperFixInFlight = false;
      });
      return;
    }
    if (!paperReady()) {
      fixPaper(phase.paper);
      return;
    }
    if (!hand) {
      if (ts >= nextStrokeAt) startHandStroke(ts);
      return;
    }
    const progress = (ts - hand.startedAt) / hand.strokeMs;
    if (progress >= 1) {
      endHandStroke(ts);
      return;
    }
    const { x, y } = strokePoint(progress, hand);
    dispatchPointer('pointermove', x, y, 1);
  };

  // A stroke in flight when a phase ends would otherwise keep painting into the
  // next phase's window under the previous phase's suppressions.
  const liftHand = () => {
    if (hand) endHandStroke(performance.now());
  };

  // ── HUD ───────────────────────────────────────────────────────────────────
  // The operator is holding the iPad, not reading the Mac's terminal, so the
  // instructions have to be on the device.
  const hudEnabled = window.__probeHud !== false;
  let hud = null;
  if (hudEnabled) {
    hud = document.createElement('div');
    hud.id = '__probeHud';
    hud.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'right:0',
      'z-index:2147483647',
      'pointer-events:none',
      'padding:6px 10px',
      'font:600 15px/1.3 -apple-system,system-ui,sans-serif',
      'text-align:center',
      'color:#fff',
      'background:rgba(20,20,24,0.86)',
    ].join(';');
    document.body.append(hud);
  }
  let hudText = '';
  const setHud = (text) => {
    if (!hud || text === hudText) return;
    hudText = text;
    hud.textContent = text;
  };

  // The one interactive element on the HUD. `pointer-events` is off for the bar so
  // it can never swallow a stroke; the button turns it back on for itself alone,
  // and removes itself the moment the window starts.
  let startButton = null;
  const showStartButton = (label, onStart) => {
    if (!hud || startButton) return;
    startButton = document.createElement('button');
    startButton.id = '__probeStart';
    startButton.textContent = label;
    startButton.style.cssText = [
      'pointer-events:auto',
      'margin-left:12px',
      'padding:6px 18px',
      'font:600 15px/1.2 -apple-system,system-ui,sans-serif',
      'color:#101014',
      'background:#7fe08a',
      'border:0',
      'border-radius:6px',
    ].join(';');
    startButton.addEventListener('click', () => {
      startButton?.remove();
      startButton = null;
      onStart();
    });
    hud.append(startButton);
  };

  // ── phase state machine ───────────────────────────────────────────────────
  const records = [];
  let index = -1;
  let phase = null;
  let done = false;

  const startPhase = (i) => {
    index = i;
    const spec = plan[i];
    phase = {
      key: spec.key,
      suppress: spec.suppress,
      paper: spec.paper,
      waitingSince: round(performance.now()),
      startedAt: null,
      endedAt: null,
      contactMs: 0,
      frames: 0,
      paperActive: null,
      halosSeen: 0,
      halosHidden: null,
    };
    records.push(phase);
    lastContactAt = null;
    applySuppressions(spec.suppress);
  };

  const finishPhase = (now) => {
    liftHand();
    phase.endedAt = round(now);
    phase.paperActive = paperActive();
    if (index + 1 < plan.length) startPhase(index + 1);
    else {
      done = true;
      phase = null;
      applySuppressions([]);
      setHud(`Done — ${plan.length} phase(s). Check the Mac.`);
      window.__probeReport = buildReport();
    }
  };

  const paperReady = () =>
    phase.paper === 'page' ? paperActive() && pageArtShowing() : !paperActive();

  const paperInstruction = () =>
    phase.paper === 'page'
      ? 'Open the coloring book → tap any page'
      : 'Open the coloring book → clear the active page';

  // Carries enough to diagnose a stalled run from the driver's heartbeat alone:
  // the first device run showed "0.0/15s" for four minutes, which could equally
  // have meant the paper gate never opened, no pointer events arriving, or
  // events arriving that nothing counted as contact. Those need different fixes.
  const progressText = () => {
    if (done) return 'done';
    const where =
      phase.startedAt === null
        ? freeDrawMs
          ? 'waiting for the START tap'
          : `waiting for ${phase.paper} paper`
        : freeDrawMs
          ? 'recording'
          : 'drawing';
    const banked = (phase.contactMs / 1000).toFixed(1);
    const target = (contactTargetMs / 1000).toFixed(0);
    return (
      `${index + 1}/${plan.length} ${phase.key} ${where} ${banked}/${target}s ` +
      `(ev ${events.length}, down ${drawingPointers.size})`
    );
  };

  // ── frame loop ────────────────────────────────────────────────────────────
  let running = true;
  let lastTs = null;
  let lastContact = false;
  let lastContactAt = null;
  let nextHudAt = 0;

  const tick = (ts) => {
    if (!running) return;
    const contact = drawingPointers.size > 0;
    const delta = lastTs === null ? null : ts - lastTs;
    // Only an interval whose BOTH ends were in contact measures drawing: the
    // first frame after a finger lands would otherwise carry however long the
    // page sat idle beforehand.
    const measured = delta !== null && contact && lastContact;

    if (!done) {
      // Free-draw waits for the START tap; the phase sweep waits for the paper.
      if (phase.startedAt === null && !freeDrawMs && paperReady()) phase.startedAt = round(ts);
      if (phase.startedAt !== null && measured) {
        phase.contactMs += delta;
        phase.frames++;
        lastContactAt = ts;
      }
      if (contact) {
        const halos = document.querySelectorAll(HALO_SELECTORS);
        if (halos.length > phase.halosSeen) {
          phase.halosSeen = halos.length;
          phase.halosHidden = getComputedStyle(halos[0]).display === 'none';
        }
      }
      // The halo is gone once the lift's state write has been rendered. A phase
      // whose halos are suppressed by CSS still has the elements, so this stays
      // a measurement of the lift path rather than of visibility.
      if (pendingLift && !document.querySelector(HALO_SELECTORS)) {
        // A rAF timestamp is the frame's start, which can precede the lift's
        // performance.now(); that reads as a negative wait rather than a fast one.
        const waited = Math.max(0, ts - pendingLift.at);
        liftLatencies.push([round(pendingLift.at), round(waited), pendingLift.phase]);
        pendingLift = null;
      }
    }

    frames.push([round(ts), delta === null ? -1 : round(delta), contact ? 1 : 0]);
    lastTs = ts;
    lastContact = contact;

    // After the frame is accounted for, so a synthetic move belongs to the
    // interval it is about to be drawn in rather than the one just closed. With
    // an explicit rate the pump owns the input instead.
    if (driveCycle && !driveHz && !done) stepHand(ts);

    if (!done && phase.startedAt !== null && freeDrawMs) {
      if (ts - phase.startedAt >= freeDrawMs) finishPhase(ts);
    } else if (!done && phase.startedAt !== null) {
      const banked = phase.contactMs >= contactTargetMs;
      const abandoned =
        phase.contactMs >= contactTargetMs * IDLE_ABANDON_FLOOR &&
        lastContactAt !== null &&
        ts - lastContactAt > IDLE_ABANDON_MS;
      if (banked || abandoned) {
        phase.abandoned = abandoned && !banked;
        finishPhase(ts);
      }
    }

    if (hud && ts >= nextHudAt) {
      nextHudAt = ts + HUD_TICK_MS;
      if (done) setHud(`Done — ${plan.length} phase(s). Check the Mac.`);
      else if (freeDrawMs) {
        if (phase.startedAt === null) {
          setHud(`${index + 1}/${plan.length} ${phase.key} — ready when you are:`);
          showStartButton(`START ${Math.round(freeDrawMs / 1000)}s`, () => {
            phase.startedAt = round(performance.now());
          });
        } else {
          const left = Math.max(0, freeDrawMs - (ts - phase.startedAt)) / 1000;
          setHud(
            `${index + 1}/${plan.length} ${phase.key} — RECORDING, draw freely  ${left.toFixed(0)}s left`
          );
        }
      } else if (driveCycle) {
        const banked = (phase.contactMs / 1000).toFixed(1);
        setHud(`${index + 1}/${plan.length} ${phase.key} — driving ${banked}s (hands off)`);
      } else if (phase.startedAt === null) {
        setHud(`${index + 1}/${plan.length} ${phase.key} — ${paperInstruction()}`);
      } else {
        const banked = (phase.contactMs / 1000).toFixed(1);
        const target = (contactTargetMs / 1000).toFixed(0);
        setHud(`${index + 1}/${plan.length} ${phase.key} — draw!  ${banked} / ${target}s`);
      }
    }
    window.__probeProgress = progressText();
    requestAnimationFrame(tick);
  };

  function buildReport() {
    const rect = canvas.getBoundingClientRect();
    return {
      meta: {
        schema: 2,
        timeOriginUnixMs: performance.timeOrigin,
        url: location.href,
        ua: navigator.userAgent,
        dpr: window.devicePixelRatio,
        viewport: { w: window.innerWidth, h: window.innerHeight },
        canvasCss: { w: round(rect.width), h: round(rect.height) },
        canvasBacking: { w: canvas.width, h: canvas.height },
        contactTargetMs,
        freeDrawMs,
        hud: hudEnabled,
        drive: driveShape,
        driveHz,
        drivePointerType: driveCycle ? drivePointerType : null,
        brush: driveBrush,
        // The reported "goes black on a coloring page, then snaps back" is what
        // an UNBLENDED line-art plate looks like: dark mode inverts the art to
        // white-on-black and `screen` is what makes that black disappear. Which
        // theme and blend a capture ran under decides whether that symptom is
        // even reachable in it.
        theme: document.documentElement.dataset.theme ?? null,
        lineartBlend: getComputedStyle(paperView).mixBlendMode,
        historySeam: !!window.__drawingDebug,
        measureNames,
        counts: { frames: frames.length, events: events.length, measures: measures.length },
      },
      phases: records,
      // Small enough to travel whole; only the per-frame and per-event tables
      // need slicing.
      history,
      liftLatencies,
    };
  }

  const detach = () => {
    liftHand();
    running = false;
    for (const name of POINTER_EVENTS) removeEventListener(name, recordPointer, pointerOptions);
    for (const [name, original] of capturedMethods) canvas[name] = original;
    measureObserver?.disconnect();
    styleEl.remove();
    hud?.remove();
  };

  window.__probe = {
    // The bulk tables are read in slices: a single Runtime.evaluate carrying a
    // multi-hundred-KB JSON string across the USB relay is the one thing here
    // that would fail late, after the drawing is already done.
    counts: () => ({ frames: frames.length, events: events.length, measures: measures.length }),
    frames: (from, count) => frames.slice(from, from + count),
    events: (from, count) => events.slice(from, from + count),
    measures: (from, count) => measures.slice(from, from + count),
    report: buildReport,
    state: () => ({ done, index, progress: progressText(), paperActive: paperActive() }),
    // Ends the run early and publishes whatever has been banked, so an
    // interrupted session still yields its numbers.
    finish() {
      if (!done) {
        phase.endedAt = round(performance.now());
        phase.paperActive = paperActive();
        done = true;
        window.__probeReport = buildReport();
      }
      return window.__probeReport;
    },
    stop() {
      detach();
      return this.finish();
    },
  };

  startPhase(0);
  requestAnimationFrame(tick);
  if (driveCycle && driveHz) {
    // A digitizer's cadence is finer than a timer can hold: asked for 8.3 ms,
    // setTimeout delivered 13 ms on device (1.39 moves per frame, against a
    // hand's 1.9-4.2). A MessageChannel spin loop hits the rate but starves the
    // event loop — it stopped the app's own UI from settling, and starving the
    // loop is exactly the thing being measured, so the pump would have written
    // its own result.
    //
    // So: a timer at the frame rate, dispatching however many moves the elapsed
    // time earned. Task granularity is coarser than real input's, but the
    // per-frame work count — the thing under test — is right.
    const intervalMs = 1000 / driveHz;
    const MAX_CATCH_UP_MOVES = 8;
    let nextMoveAt = performance.now();
    const pump = () => {
      if (!running || done) return;
      const now = performance.now();
      let dispatched = 0;
      while (now >= nextMoveAt && dispatched < MAX_CATCH_UP_MOVES) {
        nextMoveAt += intervalMs;
        stepHand(now);
        dispatched++;
      }
      // Never carry a backlog across a stall: real input coalesces rather than
      // arriving as a burst of hundreds.
      if (now > nextMoveAt) nextMoveAt = now;
      setTimeout(pump, Math.min(intervalMs, PUMP_POLL_MS));
    };
    setTimeout(pump, intervalMs);
  }
  console.log(
    `● Real-screen probe running — ${plan.length} phase(s), ` +
      (freeDrawMs
        ? `${(freeDrawMs / 1000).toFixed(0)}s free-draw window each (tap START).`
        : `${(contactTargetMs / 1000).toFixed(0)}s of drawing each.`)
  );
})();

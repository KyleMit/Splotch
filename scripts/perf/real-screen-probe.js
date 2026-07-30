/* eslint-disable */
// BROWSER PROBE — not a Node script. Injected into the REAL app (`/`) on a
// physical iPad by `npm run perf:ipad:frames` (scripts/perf/ipad-frames.mjs),
// and pasteable by hand into a Web Inspector console attached to the same page.
//
// WHY THIS EXISTS: the /dev/engine gates run (`npm run perf:ipad`) measures
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
// ipad-frames.mjs, where it can be unit-tested.
//
// Four tables come back (all times in ms, all in the page's time origin so they
// are directly comparable):
//
//   frames[]   [t, dt, contact]                  one row per rAF callback
//   events[]   [stamp, at, type, id, buttons, coalesced, onCanvas]
//              `stamp` is the event's own timestamp (when the input happened),
//              `at` is performance.now() inside the handler (when the page got
//              to it) — their difference is INPUT QUEUE DELAY, the main-thread
//              congestion a child feels as lag with no dropped frame anywhere.
//   measures[] [start, dur, name]                engine.* performance measures
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
//   synthetic mode — the driver calls __probe.drive() to generate rAF-paced
//                    pointer input (see ipad-frames.mjs), so a run needs no hand.
//
// Config globals, all optional, assigned by the driver before injection:
//   __probePhases      'page,blank' | phase spec array (see PHASES)
//   __probeContactMs   banked contact time each phase needs (default 25 s)
//   __probeHud         false to suppress the on-device HUD
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
  // constants, so scripts/tests/perf-ipad-frames.test.mjs asserts every one of
  // them still matches its component — a silent rename here would report a
  // suppression as applied while measuring nothing.
  const PAPER_VIEW_SELECTOR = '.paper-view';
  const HALO_SELECTORS = '.brush-ring, .eraser-bubble';
  const COLORING_BOOK_BUTTON = '#coloringBookButton';
  const CLEAR_PAGE_BUTTON = '[aria-label="Clear Page"]';

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

  // Each phase names the paper state it needs and what it suppresses. Order
  // minimizes paper switching for the human: blank first, then everything that
  // needs a page loaded.
  const PHASES = [
    { key: 'blank', paper: 'blank', suppress: [] },
    { key: 'page', paper: 'page', suppress: [] },
    { key: 'page-no-nudge', paper: 'page', suppress: ['nudge'] },
    { key: 'page-no-blend', paper: 'page', suppress: ['blend'] },
    { key: 'page-no-halos', paper: 'page', suppress: ['halos'] },
    { key: 'page-bare', paper: 'page', suppress: ['nudge', 'blend', 'halos'] },
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
  let newestMoveStamp = null;
  let movesSinceFrame = 0;

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
    let coalesced = 0;
    try {
      coalesced = event.getCoalescedEvents?.().length ?? 0;
    } catch {
      coalesced = 0;
    }
    events.push([
      round(event.timeStamp),
      round(performance.now()),
      type,
      event.pointerId,
      event.buttons,
      coalesced,
      onCanvas ? 1 : 0,
    ]);
    if (type === 1 && onCanvas && event.buttons !== 0) {
      newestMoveStamp = event.timeStamp;
      movesSinceFrame++;
    }
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

  const paperReady = () => (phase.paper === 'page' ? paperActive() : !paperActive());

  const paperInstruction = () =>
    phase.paper === 'page'
      ? 'Open the coloring book → tap any page'
      : 'Open the coloring book → Clear Page';

  // Carries enough to diagnose a stalled run from the driver's heartbeat alone:
  // the first device run showed "0.0/15s" for four minutes, which could equally
  // have meant the paper gate never opened, no pointer events arriving, or
  // events arriving that nothing counted as contact. Those need different fixes.
  const progressText = () => {
    if (done) return 'done';
    const where = phase.startedAt === null ? `waiting for ${phase.paper} paper` : 'drawing';
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
      if (phase.startedAt === null && paperReady()) phase.startedAt = round(ts);
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
    }

    frames.push([round(ts), delta === null ? -1 : round(delta), contact ? 1 : 0]);
    lastTs = ts;
    lastContact = contact;
    movesSinceFrame = 0;

    if (!done && phase.startedAt !== null) {
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
      else if (phase.startedAt === null) {
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
        schema: 1,
        url: location.href,
        ua: navigator.userAgent,
        dpr: window.devicePixelRatio,
        viewport: { w: window.innerWidth, h: window.innerHeight },
        canvasCss: { w: round(rect.width), h: round(rect.height) },
        canvasBacking: { w: canvas.width, h: canvas.height },
        contactTargetMs,
        hud: hudEnabled,
        measureNames,
        counts: { frames: frames.length, events: events.length, measures: measures.length },
      },
      phases: records,
    };
  }

  const detach = () => {
    running = false;
    for (const name of POINTER_EVENTS) removeEventListener(name, recordPointer, pointerOptions);
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
  console.log(
    `● Real-screen probe running — ${plan.length} phase(s), ` +
      `${(contactTargetMs / 1000).toFixed(0)}s of drawing each.`
  );
})();

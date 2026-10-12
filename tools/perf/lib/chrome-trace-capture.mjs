// Chrome-trace + runtime-metrics capture over the DevTools protocol. Works
// against any CDP target — the Playwright-launched Chromium in capture-web-session.mjs, or
// (Android) a Capacitor WebView reached via `chromium.connectOverCDP` after
// `adb forward`. capture-web-session.mjs owns the page driving; this owns the instruments.

// devtools.timeline → RunTask/Layout/Paint; v8.cpu_profiler → JS self-time;
// blink.user_timing → the engine.* marks (engine.ts) + our phase brackets;
// .frame → frame boundaries.
const TRACE_CATEGORIES = [
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
  // Style-invalidation attribution: which attribute/property change scheduled a
  // recalc and which selectors it invalidated. Costs a little tracer overhead,
  // which a --trace run accepts by construction (tracing is the diagnostic
  // mode; scored captures never trace) — added when a 161 ms theme-flip recalc
  // over 191 elements could not be attributed without it.
  'disabled-by-default-devtools.timeline.invalidationTracking',
  'disabled-by-default-blink.invalidation',
  'blink.user_timing',
  'disabled-by-default-v8.cpu_profiler',
  'v8.execute',
  'toplevel',
];

const LONG_FRAME_MS = 32;

export async function startTrace(cdp) {
  const events = [];
  cdp.on('Tracing.dataCollected', (payload) => {
    if (payload.value) events.push(...payload.value);
  });
  await cdp.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: { recordMode: 'recordAsMuchAsPossible', includedCategories: TRACE_CATEGORIES },
  });
  return events;
}

export async function stopTrace(cdp) {
  const done = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
  await cdp.send('Tracing.end');
  await done;
}

// Inject a longtask PerformanceObserver and a requestAnimationFrame frame-timer
// into the already-loaded page right before tracing starts (so the sampling
// window matches the scenario, not page load); readObservers() drains them at
// the end. Run via evaluate (not addInitScript) so it works on a native WebView
// page that's already navigated, the same as the web preview page.
export async function injectObservers(page) {
  await page.evaluate(() => {
    const w = window;
    w.__perf = { longTasks: [], frameStamps: [] };
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          w.__perf.longTasks.push({ start: e.startTime, duration: e.duration });
        }
      }).observe({ entryTypes: ['longtask'] });
    } catch {
      // longtask unsupported on this engine (e.g. WebKit) — frames still work.
    }
    // Named so the analyzer can exclude this sampler's own cost from the
    // self-time table (HARNESS_SYMBOLS).
    const __perfFrameTick = (t) => {
      w.__perf.frameStamps.push(t);
      w.__perf.raf = requestAnimationFrame(__perfFrameTick);
    };
    w.__perf.raf = requestAnimationFrame(__perfFrameTick);
  });
}

export async function readObservers(page) {
  return page.evaluate((longFrameMs) => {
    const w = window;
    if (w.__perf?.raf) cancelAnimationFrame(w.__perf.raf);
    const stamps = w.__perf?.frameStamps || [];
    const intervals = [];
    for (let i = 1; i < stamps.length; i++) intervals.push(stamps[i] - stamps[i - 1]);
    const span = stamps.length > 1 ? stamps[stamps.length - 1] - stamps[0] : 0;
    const longFrames = intervals.filter((d) => d > longFrameMs).length;
    return {
      longTasks: w.__perf?.longTasks || [],
      frames: {
        count: stamps.length,
        durationMs: span,
        fps: span > 0 ? ((stamps.length - 1) / span) * 1000 : null,
        longFrames,
      },
      heapBytes: performance.memory?.usedJSHeapSize ?? null,
    };
  }, LONG_FRAME_MS);
}

export async function heapBytes(page) {
  return page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
}

// For engines without CDP tracing (WebKit), synthesize the minimal trace the
// analyzer needs straight from the Performance API: the engine.* and phase:
// user-timing measures as blink.user_timing 'X' events. No RunTask/CPU-sampler
// data is available, so the trace-derived report sections show n/a — but the
// engine hot-path timings (the primary signal) and per-phase wall come through.
export async function collectMeasures(page) {
  return page.evaluate(() =>
    performance.getEntriesByType('measure').map((m) => ({
      cat: 'blink.user_timing',
      name: m.name,
      ph: 'X',
      ts: m.startTime * 1000,
      dur: m.duration * 1000,
      pid: 0,
      tid: 0,
    }))
  );
}

// Stitch several collectMeasures() reads into one timeline.
//
// CDP tracing is a browser-level session, so it spans navigations and a
// multi-scenario run needs no help. The Performance API is per *document*: a
// navigation both clears the entries and restarts performance.now() at 0. So a
// driver that reloads between scenarios must collect after each one — a single
// read at the end returns the last scenario only — and shift each collection
// past the previous, or every scenario would sit on top of the first.
//
// A factory rather than module state so each run (and each test) gets its own
// clock.
export function createMeasureTimeline() {
  const events = [];
  let baseUs = 0;
  return {
    events,
    append(collected) {
      let endUs = baseUs;
      for (const event of collected) {
        events.push({ ...event, ts: event.ts + baseUs });
        endUs = Math.max(endUs, baseUs + event.ts + (event.dur ?? 0));
      }
      baseUs = endUs;
      return events;
    },
  };
}

// Bracket a scenario beat with a user-timing measure (phase:<label>) so the
// analyzer can slice trace time per beat from the same track as the engine.*
// marks. The fn's own work happens between the start mark and the measure.
export async function markPhase(page, label, fn) {
  const startMark = `phase:${label}:start`;
  await page.evaluate((m) => performance.mark(m), startMark);
  const result = await fn();
  await page.evaluate(({ label, startMark }) => performance.measure(`phase:${label}`, startMark), {
    label,
    startMark,
  });
  return result;
}

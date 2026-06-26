// Chrome-trace + runtime-metrics capture over the DevTools protocol. Works
// against any CDP target — the Playwright-launched Chromium in scenario.mjs, or
// (Android) a Capacitor WebView reached via `chromium.connectOverCDP` after
// `adb forward`. scenario.mjs owns the page driving; this owns the instruments.

// devtools.timeline → RunTask/Layout/Paint; v8.cpu_profiler → JS self-time;
// blink.user_timing → the engine.* marks (engine.ts) + our phase brackets;
// .frame → frame boundaries.
const TRACE_CATEGORIES = [
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
  'blink.user_timing',
  'disabled-by-default-v8.cpu_profiler',
  'v8.execute',
  'toplevel',
];

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
  return page.evaluate(() => {
    const w = window;
    if (w.__perf?.raf) cancelAnimationFrame(w.__perf.raf);
    const stamps = w.__perf?.frameStamps || [];
    const intervals = [];
    for (let i = 1; i < stamps.length; i++) intervals.push(stamps[i] - stamps[i - 1]);
    const span = stamps.length > 1 ? stamps[stamps.length - 1] - stamps[0] : 0;
    const longFrames = intervals.filter((d) => d > 32).length;
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
  });
}

export async function heapBytes(page) {
  return page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
}

// Bracket a scenario beat with a user-timing measure (phase:<label>) so the
// analyzer can slice trace time per beat from the same track as the engine.*
// marks. The fn's own work happens between the start mark and the measure.
export async function markPhase(page, label, fn) {
  const startMark = `phase:${label}:start`;
  await page.evaluate((m) => performance.mark(m), startMark);
  await fn();
  await page.evaluate(({ label, startMark }) => performance.measure(`phase:${label}`, startMark), {
    label,
    startMark,
  });
}

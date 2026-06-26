// Turn a captured Chrome trace (+ the runtime metrics.json the harness writes
// alongside it) into a machine-readable summary.json and a human/agent-readable
// report.md. Pure trace math — no browser — so it re-runs standalone on ANY
// saved trace, including one exported from an Android WebView or iOS Web
// Inspector:  node scripts/perf/analyze.mjs <profile-dir | trace.json>
//
// The report's job is to point at the bottleneck: the engine.* rows come from
// the build-flag user-timing marks (engine.ts), the JS self-time table from the
// V8 CPU sampler, and frame/long-task/heap health from metrics.json. The
// bottleneck-reading guide lives in the `profiling` skill.

import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

const US_PER_MS = 1000;

// Leaf-ish timeline event names, bucketed for an approximate where-did-the-time-
// go breakdown. Container events (RunTask, EventDispatch) are deliberately left
// out so the buckets don't double-count the work they wrap.
const SCRIPTING = new Set([
  'FunctionCall',
  'EvaluateScript',
  'v8.compile',
  'V8.CompileCode',
  'MinorGC',
  'MajorGC',
  'RunMicrotasks',
  'ProfileCall',
  'TimerFire',
  'FireAnimationFrame',
  'GCEvent',
]);
const RENDERING = new Set([
  'Layout',
  'UpdateLayoutTree',
  'RecalculateStyles',
  'ParseAuthorStyleSheet',
  'ScheduleStyleRecalculation',
  'InvalidateLayout',
  'HitTest',
]);
const PAINTING = new Set([
  'Paint',
  'PaintImage',
  'RasterTask',
  'CompositeLayers',
  'Composite',
  'UpdateLayer',
  'UpdateLayerTree',
  'DecodeImage',
  'ImageDecodeTask',
  'GPUTask',
  'DrawFrame',
]);

const LONG_TASK_US = 50 * US_PER_MS;

// Symbols that exist only because of profiling/driving, not in the shipped app:
// the injected rAF FPS sampler, the user-timing API the PERF_MARKS calls hit
// (stripped from production), and Playwright's synthetic-input plumbing. Excluded
// from the self-time table so it reflects app compute, not measurement overhead.
const HARNESS_SYMBOLS = new Set([
  '__perfframetick',
  'mark',
  'measure',
  'requestanimationframe',
  'cancelanimationframe',
  'dispatchevent',
  'evaluate',
  'query',
  'elementsfrompoint',
  'elementfrompoint',
  'serialize',
  'innerserialize',
  'computebox',
]);

function loadInputs(target) {
  const isDir = statSync(target).isDirectory();
  const tracePath = isDir ? join(target, 'trace.json') : target;
  const dir = dirname(tracePath);
  const trace = JSON.parse(readFileSync(tracePath, 'utf8'));
  const events = Array.isArray(trace) ? trace : trace.traceEvents || [];
  let metrics = {};
  try {
    metrics = JSON.parse(readFileSync(join(dir, 'metrics.json'), 'utf8'));
  } catch {
    // metrics.json is optional — a bare exported trace still analyzes.
  }
  return { dir, events, metrics };
}

// performance.measure() lands in blink.user_timing either as a complete event
// (ph 'X', has dur) or as an async begin/end pair (ph 'b'/'e', matched by name).
// Aggregate both shapes by measure name → count / total / avg / max (ms).
function userTimingMeasures(events) {
  const byName = new Map();
  const open = new Map();
  const add = (name, durUs) => {
    const m = byName.get(name) || { count: 0, totalUs: 0, maxUs: 0 };
    m.count += 1;
    m.totalUs += durUs;
    m.maxUs = Math.max(m.maxUs, durUs);
    byName.set(name, m);
  };
  for (const e of events) {
    if (!e.cat || !e.cat.includes('blink.user_timing')) continue;
    if (e.ph === 'X' && typeof e.dur === 'number') add(e.name, e.dur);
    else if (e.ph === 'b') open.set(`${e.name}/${e.id}`, e.ts);
    else if (e.ph === 'e') {
      const key = `${e.name}/${e.id}`;
      if (open.has(key)) {
        add(e.name, e.ts - open.get(key));
        open.delete(key);
      }
    }
  }
  return [...byName.entries()]
    .map(([name, m]) => ({
      name,
      count: m.count,
      totalMs: m.totalUs / US_PER_MS,
      avgMs: m.totalUs / m.count / US_PER_MS,
      maxMs: m.maxUs / US_PER_MS,
    }))
    .sort((a, b) => b.totalMs - a.totalMs);
}

function categoryBreakdown(events) {
  let scripting = 0,
    rendering = 0,
    painting = 0,
    runTask = 0;
  const longTasks = [];
  for (const e of events) {
    if (e.ph !== 'X' || typeof e.dur !== 'number') continue;
    if (e.name === 'RunTask') {
      runTask += e.dur;
      if (e.dur >= LONG_TASK_US) longTasks.push(e.dur / US_PER_MS);
      continue;
    }
    if (SCRIPTING.has(e.name)) scripting += e.dur;
    else if (RENDERING.has(e.name)) rendering += e.dur;
    else if (PAINTING.has(e.name)) painting += e.dur;
  }
  longTasks.sort((a, b) => b - a);
  return {
    mainThreadBusyMs: runTask / US_PER_MS,
    scriptingMs: scripting / US_PER_MS,
    renderingMs: rendering / US_PER_MS,
    paintingMs: painting / US_PER_MS,
    longTasksFromTrace: { count: longTasks.length, longestMs: longTasks[0] || 0 },
  };
}

// Walk the V8 CPU sampler chunks: accumulate the node table (id → callFrame)
// across ProfileChunk events, then attribute each sample's timeDelta to its
// node's function → self-time per function (ms). Minified production builds
// yield short function names; the engine.* marks stay readable regardless.
function jsSelfTime(events) {
  const nodes = new Map();
  const selfUs = new Map();
  for (const e of events) {
    if (e.name !== 'ProfileChunk' && e.name !== 'Profile') continue;
    const profile = e.args?.data?.cpuProfile;
    if (!profile) continue;
    for (const n of profile.nodes || []) {
      if (!nodes.has(n.id)) nodes.set(n.id, n.callFrame || {});
    }
    const samples = profile.samples || [];
    const deltas = e.args?.data?.timeDeltas || [];
    for (let i = 0; i < samples.length; i++) {
      const id = samples[i];
      const dt = Math.max(0, deltas[i] || 0);
      selfUs.set(id, (selfUs.get(id) || 0) + dt);
    }
  }
  const byFn = new Map();
  for (const [id, us] of selfUs) {
    const f = nodes.get(id);
    if (!f) continue;
    const name = f.functionName || '(anonymous)';
    const loc = f.url ? `${f.url.split('/').pop()}:${(f.lineNumber ?? 0) + 1}` : '';
    const key = `${name}\t${loc}`;
    byFn.set(key, (byFn.get(key) || 0) + us);
  }
  return [...byFn.entries()]
    .map(([key, us]) => {
      const [name, loc] = key.split('\t');
      return { name, location: loc, selfMs: us / US_PER_MS };
    })
    .filter((f) => f.name !== '(idle)' && f.name !== '(program)')
    .filter((f) => !HARNESS_SYMBOLS.has(f.name.toLowerCase()))
    .sort((a, b) => b.selfMs - a.selfMs)
    .slice(0, 15);
}

// Phase brackets (phase:<label>) recorded by the scenario, as trace-clock
// windows. Both the 'X' complete shape and the 'b'/'e' async pair are handled.
function phaseWindows(events) {
  const windows = [];
  const open = new Map();
  for (const e of events) {
    if (!e.cat || !e.cat.includes('blink.user_timing')) continue;
    if (!e.name.startsWith('phase:')) continue;
    const label = e.name.replace(/^phase:/, '');
    if (e.ph === 'X' && typeof e.dur === 'number') {
      windows.push({ label, startUs: e.ts, endUs: e.ts + e.dur });
    } else if (e.ph === 'b') {
      open.set(e.name, e.ts);
    } else if (e.ph === 'e' && open.has(e.name)) {
      windows.push({ label, startUs: open.get(e.name), endUs: e.ts });
      open.delete(e.name);
    }
  }
  return windows.sort((a, b) => a.startUs - b.startUs);
}

// For each phase window, the main-thread busy time (RunTask within it) and how
// many of those tasks were long (>50 ms). Wall-clock is dominated by the
// scenario's pacing sleeps, so busy time is the real per-phase cost signal.
function perPhase(events, windows) {
  const tasks = events
    .filter((e) => e.name === 'RunTask' && e.ph === 'X' && typeof e.dur === 'number')
    .map((e) => ({ ts: e.ts, dur: e.dur }));
  return windows.map((w) => {
    let busyUs = 0;
    let longTasks = 0;
    for (const t of tasks) {
      if (t.ts >= w.startUs && t.ts < w.endUs) {
        busyUs += t.dur;
        if (t.dur >= LONG_TASK_US) longTasks += 1;
      }
    }
    return {
      label: w.label,
      wallMs: (w.endUs - w.startUs) / US_PER_MS,
      busyMs: busyUs / US_PER_MS,
      longTasks,
    };
  });
}

export function analyze(events, metrics = {}) {
  const measures = userTimingMeasures(events);
  return {
    settings: metrics.settings || {},
    breakdown: categoryBreakdown(events),
    engineHotPaths: measures.filter((m) => m.name.startsWith('engine.')),
    phases: perPhase(events, phaseWindows(events)),
    topSelfTime: jsSelfTime(events),
    frames: metrics.frames || null,
    longTasks: metrics.longTasks
      ? {
          count: metrics.longTasks.length,
          totalMs: metrics.longTasks.reduce((s, t) => s + t.duration, 0),
          longestMs: metrics.longTasks.reduce((m, t) => Math.max(m, t.duration), 0),
        }
      : null,
    heap: metrics.heap || null,
  };
}

const ms = (n) => (n == null ? 'n/a' : `${n.toFixed(1)} ms`);

function table(headers, rows) {
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
  return `${head}\n${sep}\n${body}`;
}

export function renderReport(s) {
  const out = [];
  out.push('# Splotch performance profile\n');
  const set = s.settings;
  out.push(
    table(
      ['Setting', 'Value'],
      [
        ['Captured', set.startedAt || 'n/a'],
        ['Target', set.target || 'web'],
        ['Device', set.device || 'n/a'],
        ['CPU throttle', set.throttle ? `${set.throttle}×` : 'none'],
        ['Build mode', set.buildMode || 'n/a'],
        ['Session length', ms(set.durationMs)],
      ]
    )
  );

  out.push('\n## Frame health\n');
  if (s.frames) {
    out.push(
      table(
        ['Metric', 'Value'],
        [
          ['Avg FPS (whole session)', s.frames.fps != null ? s.frames.fps.toFixed(1) : 'n/a'],
          ['Frames', String(s.frames.count ?? 'n/a')],
          ['Long frames (>32 ms)', String(s.frames.longFrames ?? 'n/a')],
        ]
      )
    );
  } else {
    out.push('_No frame metrics captured._');
  }
  if (s.longTasks) {
    out.push(
      '\n' +
        table(
          ['Long tasks (>50 ms)', 'Value'],
          [
            ['Count', String(s.longTasks.count)],
            ['Total', ms(s.longTasks.totalMs)],
            ['Longest', ms(s.longTasks.longestMs)],
          ]
        )
    );
  }

  out.push('\n## Where the main thread went (approximate — nested events may overlap)\n');
  const b = s.breakdown;
  out.push(
    table(
      ['Bucket', 'Time'],
      [
        ['Main-thread busy (RunTask)', ms(b.mainThreadBusyMs)],
        ['Scripting', ms(b.scriptingMs)],
        ['Rendering / layout', ms(b.renderingMs)],
        ['Painting / raster / GPU', ms(b.paintingMs)],
      ]
    )
  );

  out.push('\n## Engine hot paths (user-timing marks)\n');
  if (s.engineHotPaths.length) {
    out.push(
      table(
        ['Operation', 'Count', 'Total', 'Avg', 'Max'],
        s.engineHotPaths.map((m) => [
          m.name,
          String(m.count),
          ms(m.totalMs),
          ms(m.avgMs),
          ms(m.maxMs),
        ])
      )
    );
  } else {
    out.push('_No engine.* marks in this trace — was it built with PERF_MARKS=true?_');
  }

  if (s.phases.length) {
    out.push('\n## Per-phase main-thread cost (busy time, not wall-clock)\n');
    out.push(
      table(
        ['Phase', 'Busy', 'Long tasks', 'Wall'],
        s.phases.map((p) => [p.label, ms(p.busyMs), String(p.longTasks), ms(p.wallMs)])
      )
    );
  }

  out.push('\n## Top JS by self-time (V8 sampler — app code; harness symbols excluded)\n');
  if (s.topSelfTime.length) {
    out.push(
      table(
        ['Function', 'Location', 'Self'],
        s.topSelfTime.map((f) => [f.name || '(anonymous)', f.location || '', ms(f.selfMs)])
      )
    );
  } else {
    out.push('_No CPU sampler data in this trace._');
  }

  out.push('\n## Memory\n');
  if (s.heap && s.heap.afterBytes) {
    const delta = (s.heap.afterBytes - s.heap.beforeBytes) / 1048576;
    out.push(
      table(
        ['Metric', 'Value'],
        [
          ['JS heap before', `${(s.heap.beforeBytes / 1048576).toFixed(1)} MB`],
          ['JS heap after', `${(s.heap.afterBytes / 1048576).toFixed(1)} MB`],
          ['Delta', `${delta.toFixed(1)} MB`],
        ]
      )
    );
  } else {
    out.push('_No heap metrics captured._');
  }

  out.push('\n---\nSee the `profiling` skill for how to turn these numbers into a fix.\n');
  return out.join('\n');
}

function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node scripts/perf/analyze.mjs <profile-dir | trace.json>');
    process.exit(1);
  }
  const { dir, events, metrics } = loadInputs(target);
  const summary = analyze(events, metrics);
  const report = renderReport(summary);
  writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
  writeFileSync(join(dir, 'report.md'), report);
  console.log(report);
  console.log(`\nWrote ${join(dir, 'summary.json')} and ${join(dir, 'report.md')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();

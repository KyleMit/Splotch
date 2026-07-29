/* eslint-disable */
// BROWSER CONSOLE SNIPPET — not a Node script. Paste the whole file into the
// Safari Web Inspector JS console that is remote-debugging an iPad which has
// /dev/engine open (on a PERF_MARKS + PUBLIC_ENABLE_DEV_HARNESS build). It drives
// the same undo scenarios as `npm run perf:undo`, but on the real device
// (real WebKit/JavaScriptCore + GPU + 120 Hz ProMotion), and prints a table of
// the device-specific numbers the desktop harness can't give — the ADR-0066
// gates: the stroke-end commit hitch (with the paper copy and the op fold
// measured separately, so a hot commit is attributable), per-step undo restore
// time (live blit vs blob decode), and history memory, at real op volume on
// real hardware.
//
// WebKit clamps performance.now() to ~1 ms, so timings are coarse — but that is
// plenty to tell a ~10 ms blit from a hundreds-of-ms replay hang. For the
// frame/GPU picture, record a Web Inspector *Timeline* across the run and watch
// for a dropped frame at finger-lift; export it and feed it to
// `npm run perf:ios:analyze -- <export>.json` (the Web Inspector export is a
// different, mark-only/ring-buffered format — NOT the Chrome-trace perf:analyze).
// Peak memory wants the Xcode memory gauge on the same session.
//
// Run every scenario by pasting this file alone. To run a subset — which a
// Timeline recording wants, since its mark ring buffer can't hold the whole
// run — set the keys first, in their own console statement:
//   window.__perfScenarios = 'crayon-scribbles'
(async () => {
  const E = window.__engine;
  const S = window.__engineState;
  if (!E || !E.getUndoDebug || !E.strokeSync) {
    console.error(
      'window.__engine missing. Open /dev/engine on a build made with ' +
        'PERF_MARKS=true and PUBLIC_ENABLE_DEV_HARNESS=true.'
    );
    return;
  }

  // Match the device viewport so the raster is the real on-device size.
  E.resizeTo(window.innerWidth, window.innerHeight);
  await new Promise((r) => setTimeout(r, 200));

  const HZ = 120; // ProMotion; op volume ≈ HZ × stroke seconds
  const M = 160; // edge-swipe-guard margin
  const W = window.innerWidth;
  const H = window.innerHeight;
  const c = document.querySelector('#engineCanvas');
  const side = Math.max(c.width, c.height);
  const MIB = 1024 * 1024;
  const mbPerRaster = (side * side * 4) / MIB;

  const longSquiggle = (row, pts = HZ * 10) => {
    const x0 = M,
      span = W - 2 * M,
      cy = M + ((H - 2 * M) * (row + 0.5)) / 6,
      amp = (H - 2 * M) / 14,
      a = [];
    for (let i = 0; i < pts; i++) {
      const t = i / (pts - 1);
      a.push({ x: x0 + span * t, y: cy + Math.sin(t * Math.PI * 12) * amp });
    }
    return a;
  };
  // Back-and-forth triangle-wave scribble — with the crayon on, every reversal
  // splits a deposition pass and stamps a crayonFlush (the toddler fill case).
  const scribble = (row, pts = HZ * 10) => {
    const sweeps = 8,
      x0 = M,
      span = W - 2 * M,
      bandTop = M + ((H - 2 * M) * row) / 6,
      bandH = (H - 2 * M) / 8,
      a = [];
    for (let i = 0; i < pts; i++) {
      const t = i / (pts - 1);
      const tri = Math.abs(((t * sweeps) % 2) - 1);
      a.push({ x: x0 + span * (1 - tri), y: bandTop + bandH * t });
    }
    return a;
  };
  const multiGesture = (gi, perFinger = HZ * 4, fingers = 5) => {
    const out = [];
    for (let f = 0; f < fingers; f++) {
      const cy = M + ((H - 2 * M) * (f + 0.5)) / fingers,
        x0 = M,
        span = W - 2 * M,
        amp = (H - 2 * M) / (fingers * 3),
        p = [];
      for (let i = 0; i < perFinger; i++) {
        const t = i / (perFinger - 1);
        p.push({ x: x0 + span * t, y: cy + Math.sin(t * Math.PI * 8 + gi) * amp });
      }
      out.push({ pointerId: f + 1, points: p });
    }
    return out;
  };

  const percentile = (values, p) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
  };

  const agg = (from, to, name) => {
    const ms = performance
      .getEntriesByType('measure')
      .filter((m) => m.name === name && m.startTime >= from && m.startTime < to);
    if (!ms.length) return { count: 0, total: 0, avg: 0, p95: 0, max: 0 };
    const durations = ms.map((m) => m.duration);
    const total = durations.reduce((s, d) => s + d, 0);
    return {
      count: ms.length,
      total: +total.toFixed(1),
      avg: +(total / ms.length).toFixed(2),
      p95: +percentile(durations, 0.95).toFixed(2),
      max: +Math.max(...durations).toFixed(2),
    };
  };

  // Restores settle asynchronously (deep entries decode from a blob), so each
  // step waits for its engine.undo measure to land before the next fires —
  // otherwise the loop outruns the restore queue.
  const undoAll = async () => {
    const completed = () => performance.getEntriesByName('engine.undo', 'measure').length;
    let n = 0;
    for (let i = 0; i < 60; i++) {
      if (!S.canUndo) break;
      const before = completed();
      E.undo();
      n++;
      const t0 = performance.now();
      while (completed() === before && performance.now() - t0 < 5000) {
        await new Promise((r) => requestAnimationFrame(r));
      }
      await new Promise((r) => requestAnimationFrame(r));
    }
    return n;
  };

  // 22 strokes — two past the depth-20 cap (MAX_UNDO_DEPTH, matching
  // scripts/perf/undo-scenarios.mjs) — so history MB is measured with the
  // stack full and the oldest-entry fold + shift overflow path runs on the
  // real device.
  const STROKES = 22;
  // Keys mirror the `--scenarios=` keys of `npm run perf:undo`, so a row found
  // hot here names the desktop scenario that reproduces it;
  // scripts/tests/ipad-console-driver.test.mjs fails if the two drift apart.
  const SCENARIOS = [
    {
      key: 'long-squiggles',
      label: `${STROKES} long squiggles (~1200 ops each)`,
      strokes: Array.from({ length: STROKES }, (_, i) => longSquiggle(i % 6)),
    },
    {
      key: 'multi-finger',
      label: `${STROKES} five-finger drags (~2400 ops each)`,
      strokes: Array.from({ length: STROKES }, (_, i) => multiGesture(i)),
    },
    {
      key: 'crayon-squiggles',
      label: `${STROKES} crayon squiggles`,
      strokes: Array.from({ length: STROKES }, (_, i) => longSquiggle(i % 6)),
      crayon: true,
    },
    {
      key: 'crayon-scribbles',
      label: `${STROKES} crayon scribbles (pass splits)`,
      strokes: Array.from({ length: STROKES }, (_, i) => scribble(i % 6)),
      crayon: true,
    },
  ];

  // Optional subset, set in the console BEFORE pasting this file:
  //   window.__perfScenarios = 'crayon-scribbles'
  // A Web Inspector Timeline keeps its marks in a ring buffer, so recording
  // across all four scenarios drops the early ones off the front of the export
  // — scope the run to the one being recorded. Unset runs everything.
  const requested = window.__perfScenarios;
  const requestedKeys = (
    Array.isArray(requested) ? requested : typeof requested === 'string' ? requested.split(',') : []
  )
    .map((k) => k.trim())
    .filter(Boolean);
  const unknown = requestedKeys.filter((k) => !SCENARIOS.some((sc) => sc.key === k));
  if (unknown.length) {
    console.error(
      `window.__perfScenarios has unknown key(s): ${unknown.join(', ')}. ` +
        `Known keys: ${SCENARIOS.map((sc) => sc.key).join(', ')}`
    );
    return;
  }
  const selected = requestedKeys.length
    ? SCENARIOS.filter((sc) => requestedKeys.includes(sc.key))
    : SCENARIOS;
  if (selected.length !== SCENARIOS.length) {
    console.log(
      `Running ${selected.length} of ${SCENARIOS.length} scenarios: ` +
        selected.map((sc) => sc.key).join(', ')
    );
  }

  // Preflight the PERF_MARKS half of the build recipe. The harness checks above
  // prove PUBLIC_ENABLE_DEV_HARNESS is on, but a build made without
  // PERF_MARKS=true emits no marks/measures at all — undoAll's per-step wait
  // would then burn its full 5 s cap on every undo step (4 scenarios × 20 steps
  // ≈ 7 minutes of apparent hang) before printing a table of zeros. So drive
  // one probe stroke and require its engine.commit measure (emitted
  // synchronously at stroke end, engine.ts commitStrokeGroup) to exist before
  // any scenario runs.
  E.strokeSync(longSquiggle(0, 48), 'touch');
  await new Promise((r) => requestAnimationFrame(r));
  if (performance.getEntriesByName('engine.commit', 'measure').length === 0) {
    E.undo();
    console.error(
      'PERF_MARKS is off in this build: a probe stroke produced no engine.commit ' +
        'measure, so every undo step would stall for the full 5 s wait and every ' +
        'timing column would read 0. Rebuild with BOTH flags — ' +
        'PERF_MARKS=true PUBLIC_ENABLE_DEV_HARNESS=true — reload /dev/engine, ' +
        'and paste again.'
    );
    return;
  }
  await undoAll(); // drain the probe stroke so scenario counts start honest
  performance.clearMeasures(); // drop the probe's own commit/snapshot/undo entries
  performance.clearMarks();

  // Every scenario must start from blank paper AND zero history, so each row's
  // snapshot / undo-step counts come only from its own strokes — 22 strokes
  // against the depth-20 cap means every row reports 20 snapshots and drains
  // 20 undo steps.
  // A bare clearCanvas() can't be the last reset step: a clear runs the full
  // pushCommand path (it IS an undoable action, engine.ts clearCanvas), so it
  // would leave one phantom snapshot that pads every count, dilutes the undo
  // average with a trivial blank-paper restore, and inflates history MB.
  // Instead drain the history first (undo restores the pre-command snapshot,
  // so a full drain lands on the pre-history baseline — blank unless the
  // operator drew past the undo cap before pasting); only if ink remains,
  // clear and drain the clear's own entry too, then assert the count is 0.
  const resetForScenario = async (label) => {
    await undoAll();
    if (!E.isCanvasEmpty()) {
      E.clearCanvas();
      await undoAll();
    }
    const leftover = E.getUndoDebug().snapshots;
    if (leftover !== 0 || !E.isCanvasEmpty()) {
      console.warn(
        `[${label}] reset incomplete: ${leftover} leftover snapshot(s), ` +
          `canvasEmpty=${E.isCanvasEmpty()} — this row's counts include pre-existing state`
      );
    }
  };

  async function scenario({ key, label, strokes, crayon }) {
    await resetForScenario(label);
    if (E.setCrayonMode) E.setCrayonMode(!!crayon);
    const drawStart = performance.now();
    for (const s of strokes) {
      if (Array.isArray(s)) E.strokeSync(s, 'touch');
      else E.multiStrokeSync(s, 'touch');
      await new Promise((r) => requestAnimationFrame(r)); // let each stroke paint
    }
    const drawEnd = performance.now();
    const dbg = E.getUndoDebug();
    const undoStart = performance.now();
    const steps = await undoAll();
    const undoEnd = performance.now();
    if (E.setCrayonMode) E.setCrayonMode(false);
    const snap = agg(drawStart, drawEnd, 'engine.snapshot');
    const fold = agg(drawStart, drawEnd, 'engine.fold');
    const commit = agg(drawStart, drawEnd, 'engine.commit');
    const encode = agg(drawStart, drawEnd, 'engine.encode');
    const un = agg(undoStart, undoEnd, 'engine.undo');
    // rasterBytes is the live patches' real pixel cost (dirty-rect snapshots,
    // ADR-0069); the liveRasters × full-raster product is the fallback for a
    // build that predates it. The +1 raster is the paper itself.
    const liveMB = dbg.rasterBytes != null ? dbg.rasterBytes / MIB : dbg.liveRasters * mbPerRaster;
    const historyMB = liveMB + mbPerRaster + dbg.blobBytes / MIB;
    return {
      key,
      scenario: label,
      snapshots: dbg.snapshots ?? 0,
      'blob KB': Math.round((dbg.blobBytes ?? 0) / 1024),
      'snap copy max ms': snap.max,
      'fold max ms': fold.max,
      'encode max ms': encode.max,
      'commit max ms': commit.max,
      'undo steps': steps,
      'undo avg ms': un.avg,
      'undo p95 ms': un.p95,
      'undo max ms': un.max,
      'history MiB': +historyMB.toFixed(0),
    };
  }

  const rows = [];
  for (const sc of selected) {
    rows.push(await scenario(sc));
  }

  console.log(
    `Device raster ${side}×${side} = ${mbPerRaster.toFixed(1)} MiB/raster · ` +
      `120 Hz frame budget 8.3 ms · NOTE WebKit clamps perf.now() to ~1 ms`
  );
  console.table(rows);
  // Selecting the rendered table copies it fine; this is for the exact values
  // (and for re-reading a run), which are otherwise trapped in this IIFE.
  window.__perfRows = rows;
  console.log('Exact values: copy(JSON.stringify(window.__perfRows, null, 2))');
  console.log(
    'Gates (ADR-0066): undo p95 < 50 ms · commit hitch (engine.commit max) ≈ one ' +
      '120 Hz frame ≈ 8.3 ms · history ≲ 150 MiB · no dropped frames while blobs ' +
      'encode. Inside a commit, "snap copy" is engine.snapshot (the paper copy ' +
      'alone), "fold" is engine.fold (rendering the committed ops), and "encode" ' +
      'is engine.encode (demoting cold snapshots to blobs — free where toBlob ' +
      'encodes in parallel as specified, a full main-thread block in WebKit, ' +
      'which encodes inside the call). A hot commit attributes to one of those; ' +
      'if it attributes to none, the remainder is unmarked work in ' +
      'commitStrokeGroup. Watch a Web Inspector Timeline for a ' +
      'dropped frame at finger-lift and during the blob encodes after it, and ' +
      'the Xcode memory gauge for the snapshot tier. To record a Timeline over ' +
      "one hot row, rerun it alone: window.__perfScenarios = '<key>'"
  );
})();

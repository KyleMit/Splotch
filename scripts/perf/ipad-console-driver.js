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
  const mbPerRaster = (side * side * 4) / 1048576;

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

  async function scenario(label, { strokes, crayon }) {
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
    const un = agg(undoStart, undoEnd, 'engine.undo');
    const historyMB = (dbg.liveRasters + 1) * mbPerRaster + dbg.blobBytes / 1048576;
    return {
      scenario: label,
      snapshots: dbg.snapshots ?? 0,
      'blob KB': Math.round((dbg.blobBytes ?? 0) / 1024),
      'snap copy max ms': snap.max,
      'fold max ms': fold.max,
      'commit max ms': commit.max,
      'undo steps': steps,
      'undo avg ms': un.avg,
      'undo p95 ms': un.p95,
      'undo max ms': un.max,
      'history MB': +historyMB.toFixed(0),
    };
  }

  // 22 strokes — two past the depth-20 cap (MAX_UNDO_STACK_SIZE, matching
  // scripts/perf/undo-scenarios.mjs) — so history MB is measured with the
  // stack full and the oldest-entry fold + shift overflow path runs on the
  // real device.
  const STROKES = 22;
  const SCENARIOS = [
    {
      label: `${STROKES} long squiggles (~1200 ops each)`,
      strokes: Array.from({ length: STROKES }, (_, i) => longSquiggle(i % 6)),
    },
    {
      label: `${STROKES} five-finger drags (~2400 ops each)`,
      strokes: Array.from({ length: STROKES }, (_, i) => multiGesture(i)),
    },
    {
      label: `${STROKES} crayon squiggles`,
      strokes: Array.from({ length: STROKES }, (_, i) => longSquiggle(i % 6)),
      crayon: true,
    },
    {
      label: `${STROKES} crayon scribbles (pass splits)`,
      strokes: Array.from({ length: STROKES }, (_, i) => scribble(i % 6)),
      crayon: true,
    },
  ];

  const rows = [];
  for (const sc of SCENARIOS) {
    rows.push(await scenario(sc.label, sc));
  }

  console.log(
    `Device raster ${side}×${side} = ${mbPerRaster.toFixed(1)} MB/raster · ` +
      `120 Hz frame budget 8.3 ms · NOTE WebKit clamps perf.now() to ~1 ms`
  );
  console.table(rows);
  console.log(
    'Gates (ADR-0066): undo p95 < 50 ms · commit hitch (engine.commit max) ≈ one ' +
      '120 Hz frame ≈ 8.3 ms · history ≲ 150 MB · no dropped frames while blobs ' +
      'encode. Inside a commit, "snap copy" is engine.snapshot (the paper copy ' +
      'alone) and "fold" is engine.fold (rendering the committed ops) — a hot ' +
      'commit attributes to one of those. Watch a Web Inspector Timeline for a ' +
      'dropped frame at finger-lift and during the blob encodes after it, and ' +
      'the Xcode memory gauge for the snapshot tier.'
  );
})();

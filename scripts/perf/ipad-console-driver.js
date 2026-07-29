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
// plenty to tell a ~10 ms blit from a hundreds-of-ms replay hang. Peak memory
// wants the Xcode memory gauge on the same session.
//
// TWO RUN MODES — see the block by the TIMELINE constant for why they can't be
// the same run.
//
//   GATES (default). Paste this file alone. Full op volume, all four
//   scenarios, no Timeline recording. Its table is the ADR-0066 verdict.
//   Narrow it to some scenarios with:
//     window.__perfScenarios = 'crayon-scribbles'
//
//   TIMELINE. For recording a Web Inspector Timeline over one row the gates
//   run already flagged. Set both, then paste:
//     window.__perfTimeline = true; window.__perfScenarios = 'crayon-scribbles'
//   Export the recording and feed it to
//   `npm run perf:ios:analyze -- <export>.json` (the Web Inspector export is a
//   different, mark-only/ring-buffered format — NOT the Chrome-trace
//   perf:analyze). Override the volume with window.__perfStrokes /
//   window.__perfOps in either mode.
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

  // Two run modes, because the gates run and a Web Inspector Timeline recording
  // want opposite things from the same scenarios.
  //
  // GATES (default) — real op volume, so the absolute milliseconds are honest.
  // This is the mode whose numbers answer ADR-0066. Never record a Timeline
  // across it: Web Inspector has to stream, model, and render every pointer
  // event and every engine.draw mark over USB, and a full run is ~53k markers
  // (99.7% of them engine.draw) plus ~53k event records. That pins the Mac at
  // 100% CPU and buries the ~135 marks the recording was for.
  //
  // TIMELINE (window.__perfTimeline = true) — same code path, ~20× less of it,
  // so a recording stays small enough for Web Inspector to keep up. Draw marks
  // and event records both scale with op count, so cutting ops cuts the noise
  // at its source without changing what the engine does.
  //
  // TIMELINE MODE MEASURES SHAPE, NOT MAGNITUDE. Shorter strokes make smaller
  // patches and cheaper encodes, so its milliseconds are not gate numbers —
  // read it for *where* the time goes and whether a frame dropped, and quote
  // the gates run for *how much*.
  const TIMELINE = window.__perfTimeline === true;
  // 22 strokes is two past MAX_UNDO_DEPTH (20, matching
  // scripts/perf/undo-scenarios.mjs), so the gates run measures history with
  // the stack full and exercises the oldest-entry fold + shift overflow path.
  // Timeline mode only needs depth past MAX_HOT_RASTERS (2) for cold snapshots
  // to exist and encode at all.
  const STROKES = Number(window.__perfStrokes) || (TIMELINE ? 6 : 22);
  const OPS = Number(window.__perfOps) || (TIMELINE ? 200 : HZ * 10);
  const MULTI_FINGERS = 5;
  const MULTI_PER_FINGER = Math.round(OPS * 0.4);

  const longSquiggle = (row, pts = OPS) => {
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
  const scribble = (row, pts = OPS) => {
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
  const multiGesture = (gi, perFinger = MULTI_PER_FINGER, fingers = MULTI_FINGERS) => {
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

  // Keys mirror the `--scenarios=` keys of `npm run perf:undo`, so a row found
  // hot here names the desktop scenario that reproduces it;
  // scripts/tests/ipad-console-driver.test.mjs fails if the two drift apart.
  const SCENARIOS = [
    {
      key: 'long-squiggles',
      label: `${STROKES} long squiggles (~${OPS} ops each)`,
      strokes: Array.from({ length: STROKES }, (_, i) => longSquiggle(i % 6)),
    },
    {
      key: 'multi-finger',
      label: `${STROKES} five-finger drags (~${MULTI_FINGERS * MULTI_PER_FINGER} ops each)`,
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
  // A recording is always chasing one row that the gates run already flagged,
  // and Web Inspector's marker ring buffer drops the front of a longer one, so
  // timeline mode makes the choice explicit rather than guessing at a default.
  if (TIMELINE && requestedKeys.length !== 1) {
    console.error(
      'Timeline mode records exactly one scenario. Set both, then paste again:\n' +
        "  window.__perfTimeline = true; window.__perfScenarios = 'crayon-scribbles'\n" +
        `Known keys: ${SCENARIOS.map((sc) => sc.key).join(', ')}`
    );
    return;
  }
  const selected = requestedKeys.length
    ? SCENARIOS.filter((sc) => requestedKeys.includes(sc.key))
    : SCENARIOS;
  console.log(
    (TIMELINE
      ? 'TIMELINE mode — shape, not magnitude. Quote the gates run for numbers. '
      : 'GATES mode — full op volume; do NOT record a Timeline across this. ') +
      `${STROKES} strokes × ~${OPS} ops · ` +
      `${selected.length}/${SCENARIOS.length} scenarios: ${selected.map((sc) => sc.key).join(', ')}`
  );

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

  // Blank paper is the only thing a scenario needs from the reset: leftover ink
  // makes this scenario's patches denser, which inflates blob bytes and the
  // encode cost measured from them.
  //
  // Snapshot depth needs no reset and must not be chased. STROKES exceeds
  // MAX_UNDO_DEPTH (undoHistory.ts caps the stack by shifting the oldest out),
  // so by drawEnd the stack holds only this scenario's most recent commits no
  // matter what preceded them — including the clear's own entry, which is long
  // gone by then.
  //
  // Draining *after* the clear is the trap: a clear is itself undoable
  // (engine.ts clearCanvas runs the full pushCommand path), so undoing it
  // restores the very ink it just removed. That left every scenario after the
  // first drawing on inherited ink while reporting `0 leftover snapshot(s),
  // canvasEmpty=false`. Drain first — a full drain lands on the pre-history
  // baseline, which is as blank as undo can get it — then clear whatever the
  // undo cap left permanently folded into the paper, and stop.
  // Two commits of near-nothing, drawn a few px apart so each is its own stroke
  // group. Small enough that the ink they leave is not a patch worth measuring.
  const primingMark = (i) => {
    const x = M + i * 8;
    return [
      { x, y: M },
      { x: x + 2, y: M + 1 },
      { x: x + 4, y: M + 2 },
    ];
  };

  const resetForScenario = async (label) => {
    await undoAll();
    // A fresh page needs neither step: nothing to clear, so nothing to prime.
    if (E.isCanvasEmpty()) return;
    E.clearCanvas();
    if (!E.isCanvasEmpty()) {
      console.warn(
        `[${label}] paper is not blank after clearCanvas — this row's patches, ` +
          'blob bytes and encode cost include pre-existing ink'
      );
    }
    // The clear's own snapshot holds the entire inked paper it just wiped, and
    // it encodes the moment two further commits push it past MAX_HOT_RASTERS —
    // landing a full-paper PNG inside the scenario's measurement window. Where
    // the scenario's own encodes are cheap, that artifact *is* the reported max:
    // multi-finger read 176 ms this way against 1 ms measured in isolation.
    // Spend those two commits here, before drawStart, so the clear pays for
    // itself outside the window.
    for (let i = 0; i < 2; i++) {
      E.strokeSync(primingMark(i), 'touch');
      await new Promise((r) => requestAnimationFrame(r));
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
    // What the same stack would cost with the encoding removed entirely: every
    // patch resident, plus the paper. The encode is what makes a WebKit commit
    // miss its frame budget, so this is the number that says whether the ≲150 MB
    // gate still needs it. null on a build predating patchBytes.
    const unencodedMB = dbg.patchBytes != null ? dbg.patchBytes / MIB + mbPerRaster : null;
    // A zero in a timing column means one of two opposite things: too fast to
    // measure, or nothing measured at all. `commits` disambiguates — it is the
    // sample count every timing column below is a max over, so commits=0 marks
    // the whole row as missing data rather than free.
    if (commit.count === 0 && (dbg.snapshots ?? 0) > 0) {
      console.warn(
        `[${label}] ${dbg.snapshots} snapshot(s) but no engine.commit measure landed in ` +
          "the draw window — this row's timings are missing, not zero. " +
          `rasterBytes=${dbg.rasterBytes} blobBytes=${dbg.blobBytes}; zero for both means ` +
          'the snapshots carry no patches, so the fold never touched the paper — ' +
          'commitStrokeGroup parks the fold while a paper restore is still pending.'
      );
    }
    return {
      key,
      scenario: label,
      snapshots: dbg.snapshots ?? 0,
      commits: commit.count,
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
      'no-encode MiB': unencodedMB == null ? null : +unencodedMB.toFixed(0),
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
  if (TIMELINE) {
    console.log(
      'TIMELINE mode: stop the recording now and export it (Timelines tab → ' +
        'export icon), then: npm run perf:ios:analyze -- <export>.json — NOT ' +
        'perf:analyze, which reads a Chrome trace. These milliseconds are the ' +
        'shape of the run at reduced volume, not gate numbers; re-run without ' +
        'window.__perfTimeline for those. What the Timeline adds that the marks ' +
        'cannot: whether a ProMotion frame actually dropped at finger-lift, and ' +
        'the paint/composite cost of the canvas raster.'
    );
    return;
  }
  console.log(
    'Gates (ADR-0066): undo p95 < 50 ms · commit hitch (engine.commit max) ≈ one ' +
      '120 Hz frame ≈ 8.3 ms · history ≲ 150 MiB · no dropped frames while blobs ' +
      'encode. Inside a commit, "snap copy" is engine.snapshot (the paper copy ' +
      'alone), "fold" is engine.fold (rendering the committed ops), and "encode" ' +
      'is engine.encode (demoting cold snapshots to blobs — free where toBlob ' +
      'encodes in parallel as specified, a full main-thread block in WebKit, ' +
      'which encodes inside the call). A hot commit attributes to one of those; ' +
      'if it attributes to none, the remainder is unmarked work in ' +
      'commitStrokeGroup. "no-encode MiB" is what the same history would cost ' +
      'with every patch resident and nothing encoded — under the 150 MiB gate ' +
      'there, the encode is buying headroom nothing needs. ' +
      'The Xcode memory gauge covers the snapshot tier. ' +
      'To see whether a frame actually dropped at finger-lift, record a ' +
      'Timeline over the hot row in timeline mode — never across this run:\n' +
      "  window.__perfTimeline = true; window.__perfScenarios = '<key>'"
  );
})();

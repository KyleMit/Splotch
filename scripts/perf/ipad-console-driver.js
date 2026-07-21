/* eslint-disable */
// BROWSER CONSOLE SNIPPET — not a Node script. Paste the whole file into the
// Safari Web Inspector JS console that is remote-debugging an iPad which has
// /dev/engine open (on a PERF_MARKS + PUBLIC_ENABLE_DEV_HARNESS build). It drives
// the same undo/keyframe scenarios as `npm run perf:undo`, but on the real device
// (real WebKit/JavaScriptCore + GPU + 120 Hz ProMotion), and prints a table of
// the device-specific numbers the desktop harness can't give: the stroke-end
// commit hitch (keyframe build / snapshot copy) and undo time at real op volume
// on real hardware.
//
// If the build has the setUndoMode seam, every scenario runs in BOTH undo
// systems — 'replay' (ADR-0033) and 'snapshot' (the reversal prototype) — which
// is the on-device A/B that fills the snapshot-undo gates table.
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
  const modes = E.setUndoMode ? ['replay', 'snapshot'] : ['replay'];

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

  const agg = (from, to, name) => {
    const ms = performance
      .getEntriesByType('measure')
      .filter((m) => m.name === name && m.startTime >= from && m.startTime < to);
    if (!ms.length) return { count: 0, total: 0, avg: 0, max: 0 };
    const total = ms.reduce((s, m) => s + m.duration, 0);
    return {
      count: ms.length,
      total: +total.toFixed(1),
      avg: +(total / ms.length).toFixed(2),
      max: +Math.max(...ms.map((m) => m.duration)).toFixed(2),
    };
  };

  // Snapshot-mode restores settle asynchronously (deep entries decode from a
  // blob), so a false canUndo gets one re-check after a beat.
  const undoAll = async () => {
    let n = 0;
    for (let i = 0; i < 60; i++) {
      if (!S.canUndo) {
        await new Promise((r) => setTimeout(r, 50));
        if (!S.canUndo) break;
      }
      E.undo();
      n++;
      await new Promise((r) => requestAnimationFrame(r));
    }
    return n;
  };

  async function scenario(label, mode, { strokes, crayon }) {
    await undoAll(); // clean history for an accurate per-scenario count
    E.clearCanvas();
    if (E.setUndoMode) E.setUndoMode(mode); // also drops history at the switch
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
    const kf = agg(drawStart, drawEnd, 'engine.keyframe');
    const snap = agg(drawStart, drawEnd, 'engine.snapshot');
    const commit = agg(drawStart, drawEnd, 'engine.commit');
    const un = agg(undoStart, undoEnd, 'engine.undo');
    const historyMB =
      mode === 'snapshot'
        ? (dbg.snapshotLiveRasters + 1) * mbPerRaster + dbg.snapshotBlobBytes / 1048576
        : (dbg.keyframes + 1) * mbPerRaster;
    return {
      scenario: label,
      mode,
      keyframes: dbg.keyframes,
      snapshots: dbg.snapshots ?? 0,
      'blob KB': Math.round((dbg.snapshotBlobBytes ?? 0) / 1024),
      'kf max ms': kf.max,
      'snap copy max ms': snap.max,
      'commit max ms': commit.max,
      'undo steps': steps,
      'undo avg ms': un.avg,
      'undo max ms': un.max,
      'history MB': +historyMB.toFixed(0),
    };
  }

  const SCENARIOS = [
    {
      label: '12 long squiggles (~1200 ops)',
      strokes: Array.from({ length: 12 }, (_, i) => longSquiggle(i % 6)),
    },
    {
      label: '12 five-finger drags (~2400 ops)',
      strokes: Array.from({ length: 12 }, (_, i) => multiGesture(i)),
    },
    {
      label: '12 crayon squiggles',
      strokes: Array.from({ length: 12 }, (_, i) => longSquiggle(i % 6)),
      crayon: true,
    },
    {
      label: '12 crayon scribbles (pass splits)',
      strokes: Array.from({ length: 12 }, (_, i) => scribble(i % 6)),
      crayon: true,
    },
  ];

  const rows = [];
  for (const sc of SCENARIOS) {
    for (const mode of modes) {
      rows.push(await scenario(sc.label, mode, sc));
    }
  }

  console.log(
    `Device raster ${side}×${side} = ${mbPerRaster.toFixed(1)} MB/raster · ` +
      `120 Hz frame budget 8.3 ms · NOTE WebKit clamps perf.now() to ~1 ms`
  );
  console.table(rows);
  console.log(
    'Watch a Web Inspector Timeline for a dropped frame at finger-lift ' +
      '(replay: the keyframe build; snapshot: the paper copy), and the Xcode ' +
      'memory gauge for the snapshot tiers.'
  );
})();

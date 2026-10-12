// Paced crayon workload on /dev/engine: 30 back-and-forth scribbles (the
// crayon-scribbles shape, 240 points each), delivered 2 moves per animation
// frame (~120 moves/s at Safari's 60 Hz), 300 ms between strokes, then an idle
// tail until the fold loop has folded every overflow command. Records every
// engine.* measure and rAF stamp so each post-fold shadow drain AND each later
// fold can be joined to the frame that contains it.
(async () => {
  window.__paced = null;
  window.__pacedProgress = "start";
  const fail = (m) => {
    window.__paced = { error: m };
    console.error(m);
  };
  try {
    const E = window.__engine;
    const W = window.innerWidth,
      H = window.innerHeight;
    await E.resizeTo(W, H);
    await new Promise((r) => setTimeout(r, 300));
    const MARGIN = 160,
      STROKES = 30,
      POINTS = 240,
      MOVES_PER_FRAME = 2,
      GAP_MS = 300;
    const scribble = (row) => {
      const sweeps = 8,
        x0 = MARGIN,
        span = W - 2 * MARGIN;
      const bandTop = MARGIN + ((H - 2 * MARGIN) * row) / 6,
        bandH = (H - 2 * MARGIN) / 8;
      const pts = [];
      for (let i = 0; i < POINTS; i++) {
        const t = i / (POINTS - 1),
          tri = Math.abs(((t * sweeps) % 2) - 1);
        pts.push({ x: x0 + span * (1 - tri), y: bandTop + bandH * t });
      }
      return pts;
    };
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const stamps = [];
    let sampling = true;
    const tick = () => {
      stamps.push(performance.now());
      if (sampling) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    await new Promise((r) => setTimeout(r, 1000));
    performance.clearMarks();
    performance.clearMeasures();
    E.setCrayonMode(true);
    const t0 = performance.now();
    const strokeWindows = [];
    for (let s = 0; s < STROKES; s++) {
      window.__pacedProgress = `stroke ${s + 1}/${STROKES}`;
      const pts = scribble(s % 6);
      const down = performance.now();
      E.pointerEventsSync(
        [
          {
            type: "pointerdown",
            pointerId: 1,
            x: pts[0].x,
            y: pts[0].y,
            buttons: 1,
          },
        ],
        "touch",
      );
      for (let i = 1; i < pts.length; i += MOVES_PER_FRAME) {
        await frame();
        const batch = pts
          .slice(i, i + MOVES_PER_FRAME)
          .map((p) => ({
            type: "pointermove",
            pointerId: 1,
            x: p.x,
            y: p.y,
            buttons: 1,
          }));
        E.pointerEventsSync(batch, "touch");
      }
      await frame();
      const last = pts[pts.length - 1];
      E.pointerEventsSync(
        [{ type: "pointerup", pointerId: 1, x: last.x, y: last.y }],
        "touch",
      );
      strokeWindows.push([
        +(down - t0).toFixed(1),
        +(performance.now() - t0).toFixed(1),
      ]);
      await new Promise((r) => setTimeout(r, GAP_MS));
    }
    const drawEnd = performance.now();
    window.__pacedProgress = "tail";
    const fields = [
      "snapshots",
      "liveRasters",
      "rasterBytes",
      "baseRasters",
      "baseRasterBytes",
      "historyLength",
      "pendingCommands",
    ];
    const same = (a, b) => a && fields.every((f) => a[f] === b[f]);
    let prev = null,
      stable = 0;
    while (performance.now() - drawEnd < 90000) {
      const d = E.getUndoDebug();
      const q = d.pendingCommands === 0 && d.historyLength <= d.snapshots;
      stable = q && same(prev, d) ? stable + 1 : q ? 1 : 0;
      prev = d;
      if (stable >= 2) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const settledAt = performance.now();
    // Keep sampling well past the last fold so a drain it scheduled lands.
    await new Promise((r) => setTimeout(r, 4000));
    sampling = false;
    const measures = performance
      .getEntriesByType("measure")
      .filter((m) => m.name.startsWith("engine.") && m.startTime >= t0)
      .map((m) => ({
        name: m.name,
        start: +(m.startTime - t0).toFixed(2),
        dur: +m.duration.toFixed(2),
      }));
    window.__paced = {
      ua: navigator.userAgent,
      viewport: {
        W,
        H,
        dpr: devicePixelRatio,
        orientation: H > W ? "PORTRAIT" : "LANDSCAPE",
      },
      workload: {
        STROKES,
        POINTS,
        MOVES_PER_FRAME,
        GAP_MS,
        shape: "scribble(i%6), sweeps=8",
      },
      drawEndMs: +(drawEnd - t0).toFixed(1),
      settledMs: +(settledAt - t0).toFixed(1),
      strokeWindows,
      history: prev,
      topology: E.getLiveSurfaceTopology
        ? E.getLiveSurfaceTopology().length
        : null,
      nonTransparent: E.nonTransparentCount(),
      measures,
      stamps: stamps.map((t) => +(t - t0).toFixed(2)),
    };
    window.__pacedProgress = "done";
  } catch (e) {
    fail(String((e && e.stack) || e));
  }
})();

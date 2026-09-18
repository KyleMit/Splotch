// Injected into /dev/engine on the iPad. Reproduces run-undo-scenarios.mjs
// drawStrokes() for crayon-scribbles: setCrayonMode(true), then 22 scribbles x
// 1200 points in ONE synchronous task, no frame between strokes. Then waits for
// the deferred engine.crayonShadow drain and the history steady state, sampling
// rAF stamps throughout. window.__burstDiag = true additionally counts the
// drawImage calls inside the drain window (diagnostic only, not scored).
(async () => {
  window.__crayonBurst = null;
  const fail = (m) => {
    window.__crayonBurst = { error: m };
    console.error(m);
  };
  try {
    const E = window.__engine;
    if (!E || !E.strokeSync || !E.setCrayonMode)
      return fail("engine harness missing");
    const DIAG = window.__burstDiag === true;
    const W = window.innerWidth;
    const H = window.innerHeight;
    await E.resizeTo(W, H);
    await new Promise((r) => setTimeout(r, 300));

    const MARGIN = 160,
      STROKES = 22,
      POINTS = 1200;
    const scribble = (row) => {
      const sweeps = 8,
        x0 = MARGIN,
        span = W - 2 * MARGIN;
      const bandTop = MARGIN + ((H - 2 * MARGIN) * row) / 6;
      const bandH = (H - 2 * MARGIN) / 8;
      const pts = [];
      for (let i = 0; i < POINTS; i++) {
        const t = i / (POINTS - 1);
        const tri = Math.abs(((t * sweeps) % 2) - 1);
        pts.push({ x: x0 + span * (1 - tri), y: bandTop + bandH * t });
      }
      return pts;
    };
    const strokes = Array.from({ length: STROKES }, (_, i) => scribble(i % 6));

    const vis = [{ t: performance.now(), s: document.visibilityState }];
    document.addEventListener('visibilitychange', () => vis.push({ t: performance.now(), s: document.visibilityState }));
    const stamps = [];
    let sampling = true;
    const tick = () => {
      stamps.push(performance.now());
      if (sampling) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    let diag = null;
    if (DIAG) {
      diag = { calls: [], inWindow: false };
      const origMark = performance.mark.bind(performance);
      performance.mark = function (name, ...rest) {
        if (name === "engine.crayonShadow:start") diag.inWindow = true;
        if (name === "engine.crayonShadow:end") diag.inWindow = false;
        return origMark(name, ...rest);
      };
      const origDraw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (src, ...rest) {
        if (diag.inWindow)
          diag.calls.push({
            sw: src.width,
            sh: src.height,
            dw: this.canvas.width,
            dh: this.canvas.height,
            srcHidden: !!src.hidden,
            srcConnected: !!src.isConnected,
          });
        return origDraw.call(this, src, ...rest);
      };
    }

    await new Promise((r) => setTimeout(r, 1000));
    performance.clearMarks();
    performance.clearMeasures();
    const before = E.getUndoDebug();

    E.setCrayonMode(true);
    const burstStart = performance.now();
    for (const s of strokes) E.strokeSync(s, "touch");
    const burstEnd = performance.now();
    const afterBurst = E.getUndoDebug();

    const shadows = () =>
      performance
        .getEntriesByName("engine.crayonShadow", "measure")
        .filter((m) => m.startTime >= burstEnd);
    const t0 = performance.now();
    while (shadows().length === 0 && performance.now() - t0 < 60000) {
      await new Promise((r) => setTimeout(r, 50));
    }
    const firstShadowSeenAt = performance.now();
    // Steady state: no open command, fold loop idle, confirmed by an identical
    // second poll (run-undo-scenarios historyIsQuiescent + SETTLE_STABLE_SAMPLES),
    // and at least 3 s of post-drain frames.
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
    const settleStart = performance.now();
    while (performance.now() - settleStart < 60000) {
      const d = E.getUndoDebug();
      const q = d.pendingCommands === 0 && d.historyLength <= d.snapshots;
      stable = q && same(prev, d) ? stable + 1 : q ? 1 : 0;
      prev = d;
      if (stable >= 2 && performance.now() - firstShadowSeenAt >= 3000) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const settledAt = performance.now();
    await new Promise((r) => setTimeout(r, 500));
    sampling = false;
    const end = performance.now();

    const measures = performance
      .getEntriesByType("measure")
      .filter((m) => m.name.startsWith("engine.") && m.startTime >= burstStart)
      .map((m) => ({
        name: m.name,
        start: +(m.startTime - burstStart).toFixed(2),
        dur: +m.duration.toFixed(2),
      }));
    const byName = {};
    for (const m of measures) {
      const e = (byName[m.name] ??= { count: 0, max: 0, total: 0 });
      e.count++;
      e.max = Math.max(e.max, m.dur);
      e.total = +(e.total + m.dur).toFixed(2);
    }
    const topo = E.getLiveSurfaceTopology ? E.getLiveSurfaceTopology() : null;
    let work = null;
    try {
      work = E.getDrawingWorkDebug ? E.getDrawingWorkDebug() : null;
    } catch {}
    const ink = E.inkBounds ? E.inkBounds() : null;
    const nonTransparent = E.nonTransparentCount
      ? E.nonTransparentCount()
      : null;

    window.__crayonBurst = {
      ua: navigator.userAgent,
      viewport: {
        W,
        H,
        dpr: window.devicePixelRatio,
        orientation: H > W ? "PORTRAIT" : "LANDSCAPE",
        screen: { w: screen.width, h: screen.height },
      },
      workload: {
        strokes: STROKES,
        pointsPerStroke: POINTS,
        margin: MARGIN,
        shape: "scribble(i%6), sweeps=8",
      },
      engineKeys: Object.keys(E),
      burstMs: +(burstEnd - burstStart).toFixed(2),
      firstShadowSeenMs: +(firstShadowSeenAt - burstStart).toFixed(2),
      settledMs: +(settledAt - burstStart).toFixed(2),
      endMs: +(end - burstStart).toFixed(2),
      historyBefore: before,
      historyAfterBurst: afterBurst,
      historySettled: prev,
      topology: topo,
      work,
      inkBounds: ink,
      nonTransparent,
      measures,
      byName,
      stamps: stamps.map((t) => +(t - burstStart).toFixed(2)),
      diag: diag
        ? { callsInDrain: diag.calls.length, calls: diag.calls }
        : null,
    };
  } catch (e) {
    fail(String((e && e.stack) || e));
  }
})();

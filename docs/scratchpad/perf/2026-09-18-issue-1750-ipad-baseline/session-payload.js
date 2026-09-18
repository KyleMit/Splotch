// One crayon session on /dev/engine, entirely in-page: draw (paced or the
// gate's synchronous burst), present, idle until history folding settles,
// frame-paced undos, then a tail. A continuous rAF sampler spans every phase,
// so a wait moved from one phase into another still shows as a frame gap.
// Configure with window.__cfg = { arm, mode } before injecting; the result
// lands in window.__session.
(async () => {
  window.__session = null;
  window.__sessionProgress = 'start';
  const cfg = window.__cfg ?? {};
  const ARM = cfg.arm ?? 'restamp';
  const MODE = cfg.mode ?? 'paced';
  const UNDO_STEPS = cfg.undoSteps ?? 20;
  const BRUSH = cfg.brush ?? 'crayon';
  const UNDO_GAP_MS = cfg.undoGapMs ?? 0;
  const GHOST = cfg.ghost ?? 'on';
  const SETTLE_CAP_MS = 180000;
  const TAIL_MS = 4000;
  const PACED = { STROKES: 30, POINTS: 240, MOVES_PER_FRAME: 2, GAP_MS: 300 };
  const BURST = { STROKES: 22, POINTS: 1200 };
  const MARGIN = cfg.margin ?? 160;
  try {
    const E = window.__engine;
    const W = window.innerWidth;
    const H = window.innerHeight;
    await E.resizeTo(W, H);
    await new Promise((r) => setTimeout(r, 300));
    const scribble = (row, points) => {
      const sweeps = 8;
      const span = W - 2 * MARGIN;
      const bandTop = MARGIN + ((H - 2 * MARGIN) * row) / 6;
      const bandH = (H - 2 * MARGIN) / 8;
      const pts = [];
      for (let i = 0; i < points; i++) {
        const t = i / (points - 1);
        const tri = Math.abs(((t * sweeps) % 2) - 1);
        pts.push({ x: MARGIN + span * (1 - tri), y: bandTop + bandH * t });
      }
      return pts;
    };
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const stamps = [];
    let sampling = true;
    const tick = (t) => {
      stamps.push(t);
      if (sampling) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    await new Promise((r) => setTimeout(r, 1000));
    E.setCrayonDeposition(ARM);
    window.__ghostVariant = cfg.ghostVariant ?? '';
    if (BRUSH === 'crayon') E.setCrayonMode(true);
    if (GHOST === 'off') {
      // Diagnostic only: report Reduce Motion to this page, which is the
      // product's own gate for skipping the undo ghost.
      const matches = Object.getOwnPropertyDescriptor(MediaQueryList.prototype, 'matches').get;
      Object.defineProperty(MediaQueryList.prototype, 'matches', {
        configurable: true,
        get() {
          return this.media.includes('prefers-reduced-motion') ? true : matches.call(this);
        },
      });
    }
    performance.clearMarks();
    performance.clearMeasures();
    const t0 = performance.now();
    const rel = (t) => +(t - t0).toFixed(2);
    const strokeWindows = [];
    if (MODE === 'burst') {
      window.__sessionProgress = 'burst';
      for (let s = 0; s < BURST.STROKES; s++) {
        const a = performance.now();
        E.strokeSync(scribble(s % 6, BURST.POINTS), 'touch');
        strokeWindows.push([rel(a), rel(performance.now())]);
      }
    } else {
      for (let s = 0; s < PACED.STROKES; s++) {
        window.__sessionProgress = `stroke ${s + 1}/${PACED.STROKES}`;
        const pts = scribble(s % 6, PACED.POINTS);
        const down = performance.now();
        E.pointerEventsSync(
          [{ type: 'pointerdown', pointerId: 1, x: pts[0].x, y: pts[0].y, buttons: 1 }],
          'touch'
        );
        for (let i = 1; i < pts.length; i += PACED.MOVES_PER_FRAME) {
          await frame();
          E.pointerEventsSync(
            pts.slice(i, i + PACED.MOVES_PER_FRAME).map((p) => ({
              type: 'pointermove',
              pointerId: 1,
              x: p.x,
              y: p.y,
              buttons: 1,
            })),
            'touch'
          );
        }
        await frame();
        const last = pts[pts.length - 1];
        E.pointerEventsSync([{ type: 'pointerup', pointerId: 1, x: last.x, y: last.y }], 'touch');
        strokeWindows.push([rel(down), rel(performance.now())]);
        await new Promise((r) => setTimeout(r, PACED.GAP_MS));
      }
    }
    const drawEnd = performance.now();
    await frame();
    await frame();
    const presented = performance.now();
    window.__sessionProgress = 'settle';
    const fields = [
      'snapshots',
      'liveRasters',
      'rasterBytes',
      'baseRasters',
      'baseRasterBytes',
      'historyLength',
      'pendingCommands',
    ];
    const same = (a, b) => a && fields.every((f) => a[f] === b[f]);
    let prev = null;
    let stable = 0;
    while (performance.now() - presented < SETTLE_CAP_MS) {
      const d = E.getUndoDebug();
      const quiet = d.pendingCommands === 0 && d.historyLength <= d.snapshots;
      stable = quiet && same(prev, d) ? stable + 1 : quiet ? 1 : 0;
      prev = d;
      if (stable >= 2) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const settled = performance.now();
    await new Promise((r) => setTimeout(r, TAIL_MS));
    const historyBeforeUndo = E.getUndoDebug();
    window.__sessionProgress = 'undo';
    const undoStart = performance.now();
    const undos = [];
    for (let i = 0; i < UNDO_STEPS && window.__engineState.canUndo; i++) {
      const before = performance.getEntriesByName('engine.undo', 'measure').length;
      const a = performance.now();
      E.undo();
      const b = performance.now();
      while (
        performance.getEntriesByName('engine.undo', 'measure').length === before &&
        performance.now() - a < 5000
      )
        await frame();
      await frame();
      const toFrameMs = +(performance.now() - a).toFixed(2);
      const ghosts = document.querySelectorAll('.undo-ink-motion').length;
      if (UNDO_GAP_MS > 0) await new Promise((r) => setTimeout(r, Math.max(0, UNDO_GAP_MS - toFrameMs)));
      undos.push({ at: rel(a), callMs: +(b - a).toFixed(2), toFrameMs, ghosts, windowEnd: rel(performance.now()) });
    }
    const undoEnd = performance.now();
    window.__sessionProgress = 'tail';
    await new Promise((r) => setTimeout(r, TAIL_MS));
    const end = performance.now();
    sampling = false;
    const historyAfterUndo = E.getUndoDebug();
    const measures = performance
      .getEntriesByType('measure')
      .filter((m) => m.name.startsWith('engine.') && m.startTime >= t0)
      .map((m) => [m.name, rel(m.startTime), +m.duration.toFixed(2)]);
    const entry = performance
      .getEntriesByType('resource')
      .map((r) => r.name)
      .find((n) => n.includes('/entry/start.'));
    window.__session = {
      arm: ARM,
      mode: MODE,
      brush: BRUSH,
      ghost: GHOST,
      ghostVariant: window.__ghostVariant,
      undoGapMs: UNDO_GAP_MS,
      margin: MARGIN,
      ua: navigator.userAgent,
      entry: entry ? entry.split('/').pop() : null,
      viewport: { W, H, dpr: devicePixelRatio, orientation: H > W ? 'PORTRAIT' : 'LANDSCAPE' },
      workload: MODE === 'burst' ? BURST : PACED,
      phases: {
        drawEnd: rel(drawEnd),
        presented: rel(presented),
        settled: rel(settled),
        undoStart: rel(undoStart),
        undoEnd: rel(undoEnd),
        end: rel(end),
      },
      strokeWindows,
      undos,
      historyBeforeUndo,
      historyAfterUndo,
      nonTransparentAfterUndo: E.nonTransparentCount(),
      measures,
      stamps: stamps.filter((t) => t >= t0).map(rel),
    };
    window.__sessionProgress = 'done';
  } catch (e) {
    window.__session = { error: String((e && e.stack) || e) };
  }
})();

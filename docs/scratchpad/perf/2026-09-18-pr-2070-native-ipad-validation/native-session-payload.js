// Native-app port of docs/scratchpad/perf/2026-09-18-issue-1750-ipad-baseline/session-payload.js.
// The bundled WKWebView has no /dev/engine and no window.__engine, so:
//  - drawing is the same paced crayon-scribbles geometry, dispatched as touch
//    PointerEvents on #drawingCanvas (the engine's own listeners), 2 moves/frame;
//  - the brush is selected through the real Brushes menu and verified with
//    __committedBrushMode; the pipeline is the build's own (glaze-direct on native);
//  - each undo is the repo's shared undo action (tools/perf/lib/undo-driver.mjs,
//    injected as window.__undoAction), spaced like #2070 (700 ms from call start).
// Everything else (continuous rAF sampler, settle rule, tail, result shape) is
// unchanged, so analyze.mjs scores it as-is.
(async () => {
  window.__session = null;
  window.__sessionProgress = "start";
  const cfg = window.__cfg ?? {};
  const MODE = "paced";
  const UNDO_STEPS = cfg.undoSteps ?? 20;
  const BRUSH = cfg.brush ?? "crayon";
  const UNDO_GAP_MS = cfg.undoGapMs ?? 700;
  const PIXEL_CHECK = cfg.pixelCheck === true;
  const BRUSH_BUTTON = {
    crayon: "#crayonBrushButton",
    magic: "#magicBrushButton",
    pen: "#penBrushButton",
  };
  const fnv = (bytes, h = 0x811c9dc5) => {
    for (let i = 0; i < bytes.length; i++)
      h = Math.imul(h ^ bytes[i], 0x01000193) >>> 0;
    return h;
  };
  const tiles = () => [...document.querySelectorAll("canvas.live-tile")];
  const hashCanvas = (c) =>
    c && c.width && c.height
      ? fnv(c.getContext("2d").getImageData(0, 0, c.width, c.height).data)
      : null;
  const tileHash = () =>
    tiles()
      .reduce(
        (h, c) =>
          fnv(new Uint8Array(new Uint32Array([hashCanvas(c) ?? 0]).buffer), h),
        0x811c9dc5,
      )
      .toString(16);
  const inkCount = () => {
    let n = 0;
    for (const c of tiles()) {
      if (!c.width || !c.height || c.width * c.height <= 300 * 150) continue;
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
    }
    return n;
  };
  const SETTLE_CAP_MS = 180000;
  const TAIL_MS = 4000;
  const PACED = { STROKES: 30, POINTS: 240, MOVES_PER_FRAME: 2, GAP_MS: 300 };
  const MARGIN = cfg.margin ?? 160;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const waitFor = async (pred, ms = 10000) => {
    const end = performance.now() + ms;
    while (performance.now() < end) {
      if (pred()) return true;
      await sleep(100);
    }
    return false;
  };
  try {
    const D = window.__drawingDebug;
    const canvas = document.querySelector("#drawingCanvas");
    if (!D || !canvas)
      throw new Error("missing __drawingDebug or #drawingCanvas");
    if (D.getUndoDebug().historyLength !== 0)
      throw new Error("page did not start blank");
    document.querySelector("#brushButton")?.click();
    if (!(await waitFor(() => document.querySelector(BRUSH_BUTTON[BRUSH]))))
      throw new Error("brush menu did not open");
    document.querySelector(BRUSH_BUTTON[BRUSH]).click();
    if (!(await waitFor(() => window.__committedBrushMode?.() === BRUSH)))
      throw new Error(`engine did not commit ${BRUSH}`);
    await sleep(500);
    if (document.querySelector("[role=menu], .brush-menu[open]"))
      document.body.click();
    const W = window.innerWidth;
    const H = window.innerHeight;
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
    const pointer = (type, p) =>
      canvas.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 1,
          pointerType: "touch",
          isPrimary: true,
          clientX: p.x,
          clientY: p.y,
          buttons: type === "pointerup" ? 0 : 1,
          button: 0,
          pressure: type === "pointerup" ? 0 : 0.5,
          width: 20,
          height: 20,
        }),
      );
    const stamps = [];
    let sampling = true;
    const tick = (t) => {
      stamps.push(t);
      if (sampling) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    await sleep(1000);
    const workBefore = D.getDrawingWorkDebug?.() ?? null;
    performance.clearMarks();
    performance.clearMeasures();
    const t0 = performance.now();
    const rel = (t) => +(t - t0).toFixed(2);
    const strokeWindows = [];
    for (let s = 0; s < PACED.STROKES; s++) {
      window.__sessionProgress = `stroke ${s + 1}/${PACED.STROKES}`;
      const pts = scribble(s % 6, PACED.POINTS);
      const down = performance.now();
      pointer("pointerdown", pts[0]);
      for (let i = 1; i < pts.length; i += PACED.MOVES_PER_FRAME) {
        await frame();
        for (const p of pts.slice(i, i + PACED.MOVES_PER_FRAME))
          pointer("pointermove", p);
      }
      await frame();
      pointer("pointerup", pts[pts.length - 1]);
      strokeWindows.push([rel(down), rel(performance.now())]);
      await sleep(PACED.GAP_MS);
    }
    const drawEnd = performance.now();
    await frame();
    await frame();
    const presented = performance.now();
    window.__sessionProgress = "settle";
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
    let prev = null;
    let stable = 0;
    while (performance.now() - presented < SETTLE_CAP_MS) {
      const d = D.getUndoDebug();
      const quiet = d.pendingCommands === 0 && d.historyLength <= d.snapshots;
      stable = quiet && same(prev, d) ? stable + 1 : quiet ? 1 : 0;
      prev = d;
      if (stable >= 2) break;
      await sleep(100);
    }
    const settled = performance.now();
    await sleep(TAIL_MS);
    const historyBeforeUndo = D.getUndoDebug();
    const tilesBeforeUndo = PIXEL_CHECK ? tileHash() : null;
    window.__sessionProgress = "undo";
    const undoStart = performance.now();
    const undos = [];
    for (let i = 0; i < UNDO_STEPS; i++) {
      const a = performance.now();
      const action = await window.__undoAction(i);
      if (!action) throw new Error(`undo ${i} produced no engine.undo measure`);
      const toFrameMs = +(performance.now() - a).toFixed(2);
      const ghosts = document.querySelectorAll(".undo-ink-motion").length;
      const pixels = PIXEL_CHECK
        ? {
            ghost:
              hashCanvas(document.querySelector(".undo-ink-motion"))?.toString(
                16,
              ) ?? null,
            tiles: tileHash(),
          }
        : undefined;
      if (UNDO_GAP_MS > 0) await sleep(Math.max(0, UNDO_GAP_MS - toFrameMs));
      undos.push({
        at: rel(a),
        callMs: +(action.engineMs ?? 0).toFixed(2),
        engineMs: +action.engineMs.toFixed(2),
        nextFrameMs: +action.nextFrameMs.toFixed(2),
        toFrameMs,
        ghosts,
        pixels,
        windowEnd: rel(performance.now()),
      });
    }
    const undoEnd = performance.now();
    window.__sessionProgress = "tail";
    await sleep(TAIL_MS);
    const end = performance.now();
    await frame();
    sampling = false;
    const historyAfterUndo = D.getUndoDebug();
    const workAfter = D.getDrawingWorkDebug?.() ?? null;
    const ghostElementsAfterTail =
      document.querySelectorAll(".undo-ink-motion").length;
    const measures = performance
      .getEntriesByType("measure")
      .filter((m) => m.name.startsWith("engine.") && m.startTime >= t0)
      .map((m) => [m.name, rel(m.startTime), +m.duration.toFixed(2)]);
    const entry = performance
      .getEntriesByType("resource")
      .map((r) => r.name)
      .concat(
        [...document.querySelectorAll("link[href],script[src]")].map(
          (e) => e.href || e.src,
        ),
      )
      .find((n) => n.includes("/entry/start."));
    // Read back only after the sampler stopped: it forces rendering.
    const nonTransparentAfterUndo = inkCount();
    window.__session = {
      arm: cfg.arm ?? "native",
      mode: MODE,
      brush: BRUSH,
      committedBrush: window.__committedBrushMode?.() ?? null,
      ghost: "on",
      undoGapMs: UNDO_GAP_MS,
      margin: MARGIN,
      ua: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
      href: location.href,
      entry: entry ? entry.split("/").pop() : null,
      viewport: {
        W,
        H,
        dpr: devicePixelRatio,
        orientation: H > W ? "PORTRAIT" : "LANDSCAPE",
      },
      workload: PACED,
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
      tilesBeforeUndo,
      historyAfterUndo,
      workBefore,
      workAfter,
      ghostElementsAfterTail,
      nonTransparentAfterUndo,
      measures,
      stamps: stamps
        .slice(Math.max(0, stamps.findIndex((t) => t >= t0) - 1))
        .map(rel),
    };
    window.__sessionProgress = "done";
  } catch (e) {
    window.__session = { error: String((e && e.stack) || e) };
  }
})();

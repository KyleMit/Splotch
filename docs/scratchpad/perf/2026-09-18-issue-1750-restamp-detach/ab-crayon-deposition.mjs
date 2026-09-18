// Diagnostic A/B for issue 1750, not a gate. Same crayon-scribbles
// geometry, synchronous pacing and viewport as run-undo-scenarios.mjs, with the
// crayon deposition pipeline switched through the /dev/engine tuning seam.
import { chromium, webkit } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { IPAD_PRO } from '../../../../tools/perf/lib/profile-devices.mjs';

const BASE = process.argv[2];
const ARMS = process.argv[3].split(',');
const OUT = process.argv[4];
const ENGINE = process.argv[5] ?? 'webkit';
const STROKES = 22;
const LONG_OPS = 1200;
const MARGIN = 160;

function scribble(row, width, height, points = LONG_OPS) {
  const sweeps = 8;
  const x0 = MARGIN;
  const span = width - 2 * MARGIN;
  const bandTop = MARGIN + ((height - 2 * MARGIN) * row) / 6;
  const bandH = (height - 2 * MARGIN) / 8;
  const pts = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const tri = Math.abs(((t * sweeps) % 2) - 1);
    pts.push({ x: x0 + span * (1 - tri), y: bandTop + bandH * t });
  }
  return pts;
}

const browser = await (ENGINE === 'chromium' ? chromium : webkit).launch();
const results = [];
for (const arm of ARMS) {
  const ctx = await browser.newContext({
    viewport: { width: IPAD_PRO.width, height: IPAD_PRO.height },
    deviceScaleFactor: IPAD_PRO.deviceScaleFactor,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}dev/engine`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__engineReady === true);
  await page.evaluate(({ w, h }) => window.__engine.resizeTo(w, h), {
    w: IPAD_PRO.width,
    h: IPAD_PRO.height,
  });
  await page.waitForTimeout(150);
  const strokes = Array.from({ length: STROKES }, (_, i) =>
    scribble(i % 6, IPAD_PRO.width, IPAD_PRO.height)
  );
  const r = await page.evaluate(
    async ({ strokes, arm }) => {
      const raf = () => new Promise((res) => requestAnimationFrame(res));
      window.__engine.setCrayonDeposition(arm);
      window.__engine.setCrayonMode(true);
      performance.clearMeasures();
      const t0 = performance.now();
      for (const s of strokes) window.__engine.strokeSync(s, 'touch');
      const tDraw = performance.now();
      await raf();
      await raf();
      const tPresent = performance.now();
      const agg = {};
      for (const m of performance.getEntriesByType('measure')) {
        if (!m.name.startsWith('engine.')) continue;
        const e = (agg[m.name] ??= { count: 0, total: 0, max: 0, all: [] });
        e.count++;
        e.total += m.duration;
        e.max = Math.max(e.max, m.duration);
        e.all.push(m.duration);
      }
      const commits = (agg['engine.commit']?.all ?? []).slice().sort((a, b) => a - b);
      const p95 = commits.length ? commits[Math.ceil(commits.length * 0.95) - 1] : null;
      performance.clearMeasures();
      await new Promise((res) => setTimeout(res, 3000));
      const u0 = performance.now();
      let steps = 0;
      for (let i = 0; i < 60 && window.__engineState.canUndo; i++) {
        const before = performance.getEntriesByName('engine.undo', 'measure').length;
        window.__engine.undo();
        steps++;
        const s0 = performance.now();
        while (
          performance.getEntriesByName('engine.undo', 'measure').length === before &&
          performance.now() - s0 < 5000
        )
          await raf();
        await raf();
      }
      const u1 = performance.now();
      const debug = window.__engine.getUndoDebug();
      for (const e of Object.values(agg)) delete e.all;
      return {
        pageDrawMs: tDraw - t0,
        drawToSecondRafMs: tPresent - t0,
        commitP95Ms: p95,
        measures: agg,
        undoLoopMs: u1 - u0,
        undoSteps: steps,
        debugAfterUndo: debug,
      };
    },
    { strokes, arm }
  );
  results.push({ arm, ...r });
  console.log(
    arm,
    JSON.stringify({
      pageDrawMs: Math.round(r.pageDrawMs),
      drawToSecondRafMs: Math.round(r.drawToSecondRafMs),
      commitP95Ms: r.commitP95Ms,
      undoLoopMs: Math.round(r.undoLoopMs),
      undoSteps: r.undoSteps,
    })
  );
  await ctx.close();
}
await browser.close();
writeFileSync(OUT, JSON.stringify({ browser: ENGINE, version: browser.version(), results }, null, 1));

// Crayon draw-hot-path perf probe (area:crayon), criterion: average per-op draw
// ≲ 2 ms and no single op > ~8 ms under a 4× CPU throttle. Dispatches a long
// stroke one pointermove at a time and times each move's synchronous work
// (engine.draw → strokeSmoothSegments → renderOp) INSIDE the page, so the number
// is real throttled compute with no CDP round-trip. Runs the crayon over a
// populated command log (prior committed crayon strokes) so the buildup-layer
// scan is exercised, and compares against the solid pen for context.
//
//   node scripts/crayon/perf-probe.mjs           # build + probe
//   node scripts/crayon/perf-probe.mjs --no-build

import { chromium } from '@playwright/test';
import { ROOT, chromiumExecutablePath, sleep } from '../lib/utils.mjs';
import { buildAndPreview } from '../perf/preview.mjs';

const args = process.argv.slice(2);
const build = !args.includes('--no-build');
const THROTTLE = 4;
const W = 360;
const H = 320;

async function main() {
  process.env.PUBLIC_ENABLE_DEV_HARNESS = 'true';
  const { base, stop } = await buildAndPreview(4175, { build });
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromiumExecutablePath(chromium),
  });
  try {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await page.goto(`${base}dev/engine`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#engineCanvas');
    await page.waitForFunction(() => window.__engineReady === true);
    await page.evaluate(({ w, h }) => window.__engine.resizeTo(w, h), { w: W, h: H });
    await sleep(80);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });

    const result = await page.evaluate(runProbe, { W, H });
    console.log(JSON.stringify({ throttle: THROTTLE, ...result }, null, 2));

    const warmOk = result.crayon.warm.avg <= 2 && result.crayon.warm.max <= 8;
    const firstOk = result.crayon.warmedFirst.max <= 8;
    console.log(
      `\ncriterion 9 (crayon, steady): avg ${result.crayon.warm.avg.toFixed(3)}ms ` +
        `(≤ 2ms) · max ${result.crayon.warm.max.toFixed(2)}ms (≤ 8ms) → ${warmOk ? 'PASS' : 'FAIL'}`
    );
    console.log(
      `first stroke after idle-warm: avg ${result.crayon.warmedFirst.avg.toFixed(3)}ms · ` +
        `max ${result.crayon.warmedFirst.max.toFixed(2)}ms (≤ 8ms) → ${firstOk ? 'PASS' : 'FAIL'}`
    );
    console.log(
      `unwarmed first stroke (tile build on the frame, mitigated in-app): max ${result.crayon.cold.max.toFixed(2)}ms`
    );
    const ok = warmOk && firstOk;
    await ctx.close();
    if (!ok) process.exitCode = 1;
  } finally {
    await browser.close();
    stop();
  }
}

// Runs in the page under CPU throttle. Times each pointermove's synchronous
// engine work with performance.now().
async function runProbe({ W, H }) {
  const E = window.__engine;
  const cv = document.querySelector('#engineCanvas');
  const rect = cv.getBoundingClientRect();
  const ev = (type, id, x, y, pointerType) =>
    cv.dispatchEvent(
      new PointerEvent(type, {
        pointerId: id,
        pointerType,
        clientX: rect.left + x,
        clientY: rect.top + y,
        buttons: type === 'pointerup' ? 0 : 1,
        bubbles: true,
        cancelable: true,
      })
    );

  // A long wavy stroke across the canvas — one op per move.
  const N = 260;
  const stroke = (yBase) =>
    Array.from({ length: N }, (_, i) => ({
      x: 30 + (i / (N - 1)) * (W - 60),
      y: yBase + Math.sin(i / 6) * 30,
    }));

  // Time a stroke move-by-move with pen input (bypasses the color-change debounce
  // a synchronous setColor arms). Returns the per-move deltas in ms.
  function timeStroke(points) {
    const deltas = [];
    let id = (timeStroke._id = (timeStroke._id || 100) + 1);
    ev('pointerdown', id, points[0].x, points[0].y, 'pen');
    for (let i = 1; i < points.length; i++) {
      const t0 = performance.now();
      ev('pointermove', id, points[i].x, points[i].y, 'pen');
      deltas.push(performance.now() - t0);
    }
    ev('pointerup', id, points[points.length - 1].x, points[points.length - 1].y, 'pen');
    return deltas;
  }

  const stats = (deltas) => {
    const s = [...deltas].sort((a, b) => a - b);
    const sum = s.reduce((a, b) => a + b, 0);
    return {
      avg: sum / s.length,
      p95: s[Math.floor(s.length * 0.95)],
      max: s[s.length - 1],
      n: s.length,
    };
  };

  const idle = () =>
    new Promise((r) =>
      typeof requestIdleCallback === 'function'
        ? requestIdleCallback(() => r(), { timeout: 500 })
        : setTimeout(r, 60)
    );

  E.setColor('#2f6db3');

  // Pen baseline (solid renderer).
  E.setCrayonMode(false);
  const penDeltas = timeStroke(stroke(90));
  E.clearCanvas();

  // Crayon COLD: brand-new colour timed immediately, with no chance for the idle
  // warm to run — the raw one-time tile-build-on-the-frame cost (mitigated in-app
  // by the idle warm below; shown here for reference).
  E.setCrayonVariant('waxy');
  E.setColor('#118a4b');
  E.setCrayonMode(true);
  const coldDeltas = timeStroke(stroke(90));
  E.clearCanvas();

  // Realistic first stroke: pick a fresh colour, then let the engine's idle warm
  // (scheduled by setColor/setCrayonMode) build the tiles BEFORE drawing.
  E.setColor('#b0392f');
  await idle();
  await idle();
  const warmedFirstDeltas = timeStroke(stroke(90));
  E.clearCanvas();

  // Steady state: populate the command log with committed crayon strokes so the
  // buildup-layer scan (crayonLayerAt walks the log) is exercised, and the timed
  // stroke overlaps them (layer 1, tiles already warm).
  for (let k = 0; k < 12; k++) timeStroke(stroke(60 + k * 12));
  const warmDeltas = timeStroke(stroke(150));

  return {
    pen: stats(penDeltas),
    crayon: {
      cold: stats(coldDeltas),
      warmedFirst: stats(warmedFirstDeltas),
      warm: stats(warmDeltas),
    },
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

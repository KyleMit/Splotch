// Crayon draw hot-path probe: headless Chromium under a 4x CPU throttle (the
// repo's brush-perf setup), driving the real engine through /dev/engine. It
// dispatches pointermoves one at a time and times each draw() (one crayon path
// op stroked through the tooth pattern), reporting avg and worst per-op — the
// acceptance bar is avg ≲ 2ms and no single op/frame > ~8ms. Runs pen and crayon
// so the crayon overhead is visible.
//
//   node scripts/crayon/perf.mjs [--no-build]
import { chromium } from '@playwright/test';
import { ROOT, chromiumExecutablePath, sleep } from '../lib/utils.mjs';
import { buildAndPreview } from '../perf/preview.mjs';

const build = !process.argv.includes('--no-build');
const THROTTLE = 4;
const DSF = 2; // realistic phone backing-store (renderScale 2)
const CSS = { w: 412, h: 720 };

// A long, varied scribble: many short segments (slow drawing) plus some long
// jumps (fast drawing = big per-op area), so we see both avg and worst op.
function scribble() {
  const pts = [];
  for (let i = 0; i <= 600; i++) {
    const t = i / 600;
    pts.push({
      x: 40 + t * 330 + Math.sin(t * Math.PI * 40) * 30,
      y: 80 + Math.sin(t * Math.PI * 12) * 260 + t * 40,
    });
  }
  return pts;
}

async function measure(page, { crayon }) {
  return page.evaluate(
    async ({ pts, crayon, css }) => {
      const cv = document.querySelector('#engineCanvas');
      const E = window.__engine;
      E.clearCanvas();
      E.setCrayonMode(crayon);
      E.setColor('#d1442a');
      E.setStrokeWidth(28);
      const rect = cv.getBoundingClientRect();
      const ev = (type, p) =>
        cv.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 1,
            pointerType: 'pen',
            clientX: rect.left + p.x,
            clientY: rect.top + p.y,
            buttons: 1,
            bubbles: true,
            cancelable: true,
          })
        );
      ev('pointerdown', pts[0]);
      const times = [];
      for (let i = 1; i < pts.length; i++) {
        const t0 = performance.now();
        ev('pointermove', pts[i]);
        times.push(performance.now() - t0);
      }
      ev('pointerup', pts[pts.length - 1]);
      times.sort((a, b) => a - b);
      const sum = times.reduce((s, t) => s + t, 0);
      return {
        ops: times.length,
        avg: sum / times.length,
        p50: times[Math.floor(times.length * 0.5)],
        p99: times[Math.floor(times.length * 0.99)],
        max: times[times.length - 1],
      };
    },
    { pts: scribble(), crayon, css: CSS }
  );
}

async function main() {
  process.env.PUBLIC_ENABLE_DEV_HARNESS = 'true';
  const { base, stop } = await buildAndPreview(4193, { build });
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromiumExecutablePath(chromium),
  });
  try {
    const ctx = await browser.newContext({
      viewport: { width: CSS.w, height: CSS.h },
      deviceScaleFactor: DSF,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
    await page.goto(`${base}dev/engine`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__engineReady === true);
    await page.evaluate(({ w, h }) => window.__engine.resizeTo(w, h), CSS);
    await sleep(120);

    for (const crayon of [false, true]) {
      // Warm once (build the tile / JIT), then measure.
      await measure(page, { crayon });
      const r = await measure(page, { crayon });
      const label = crayon ? 'crayon' : 'pen   ';
      console.log(
        `${label}  ops ${r.ops}  avg ${r.avg.toFixed(3)}ms  p50 ${r.p50.toFixed(3)}  p99 ${r.p99.toFixed(3)}  max ${r.max.toFixed(3)}ms   (4x CPU throttle, DSF ${DSF})`
      );
    }
  } finally {
    await browser.close();
    stop();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

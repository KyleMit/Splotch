// Drive a deterministic "toddler session" through the real Splotch app in a
// headless Chromium while a Chrome trace records, then hand the trace + runtime
// metrics to analyze.mjs. One command, fully autonomous:
//   npm run perf:web            (phone viewport, 4× CPU throttle)
//   npm run perf:web:raw        (no throttle)
//   node scripts/perf/scenario.mjs --device=tablet --throttle=6 --no-build
//
// Profiles the production preview build (built with PERF_MARKS=true so the
// engine.* user-timing marks are present). Headless + CPU throttling
// approximates a phone — good for hotspots and regressions, but absolute frame
// numbers still want the Android path (see the `profiling` skill). capture.mjs +
// analyze.mjs are reused unchanged by the native paths.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, sleep } from '../lib/utils.mjs';
import {
  canvasBox,
  expandDrawer,
  pickColor,
  setStrokeSize,
  drawStroke,
  circlePts,
  zigzag,
  arcPts,
} from '../lib/app-driver.mjs';
import { buildAndPreview } from './preview.mjs';
import {
  startTrace,
  stopTrace,
  injectObservers,
  readObservers,
  heapBytes,
  markPhase,
} from './capture.mjs';
import { analyze, renderReport } from './analyze.mjs';

const DEVICES = {
  phone: { width: 412, height: 915, deviceScaleFactor: 2.6 },
  tablet: { width: 1024, height: 1366, deviceScaleFactor: 2 },
  desktop: { width: 1280, height: 800, deviceScaleFactor: 1 },
};

// Brand palette (src/lib/state/colors.svelte) — the swatches the harness clicks.
const COLORS = ['#EC534E', '#F89C45', '#F9D24F', '#8CC864', '#62A2E9', '#AB71E1'];

const args = process.argv.slice(2);
const flag = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : def;
};
const deviceName = flag('device', 'phone');
const device = DEVICES[deviceName] || DEVICES.phone;
const throttle = args.includes('--no-throttle') ? 1 : Number(flag('throttle', '4'));
const port = Number(flag('port', '4173'));
const build = !args.includes('--no-build');

async function beat(page, label, fn) {
  process.stdout.write(`  • ${label}… `);
  try {
    await markPhase(page, label, fn);
    console.log('ok');
  } catch (err) {
    console.log(`skipped (${err.message})`);
  }
}

// Five concurrent touch pointers spiralling outward — true multi-finger input
// through the engine's pointerdown/move/up handlers, rAF-paced so each frame
// renders (matching how real coalesced multi-touch arrives). Driven on the live
// #drawingCanvas, so it works on the production build with no dev harness.
async function multiFingerDraw(page, fingers = 5, steps = 48) {
  await page.evaluate(
    async ({ fingers, steps }) => {
      const canvas = document.querySelector('#drawingCanvas');
      if (!canvas) throw new Error('no #drawingCanvas');
      const rect = canvas.getBoundingClientRect();
      const raf = () => new Promise((r) => requestAnimationFrame(r));
      const ev = (type, id, x, y) =>
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: id,
            pointerType: 'touch',
            isPrimary: id === 1,
            clientX: rect.left + x,
            clientY: rect.top + y,
            bubbles: true,
            cancelable: true,
          })
        );
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const maxR = Math.min(rect.width, rect.height) * 0.32;
      for (let f = 0; f < fingers; f++) {
        const a = (f / fingers) * Math.PI * 2;
        ev('pointerdown', f + 1, cx + Math.cos(a) * 30, cy + Math.sin(a) * 30);
      }
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        for (let f = 0; f < fingers; f++) {
          const a = (f / fingers) * Math.PI * 2 + t * Math.PI * 2;
          const r = 30 + t * maxR;
          ev('pointermove', f + 1, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        await raf();
      }
      for (let f = 0; f < fingers; f++) ev('pointerup', f + 1, cx, cy);
    },
    { fingers, steps }
  );
}

async function undoToEmpty(page) {
  for (let i = 0; i < 12; i++) {
    const btn = page.locator('#undoButton');
    if ((await btn.count()) === 0 || (await btn.isDisabled())) break;
    await btn.click();
    await sleep(120);
  }
}

// The clear control is a drag-past-threshold gesture (dragToClear, ~40% of the
// viewport diagonal). Drag from the button toward the far top corner; best-effort.
async function clearDrag(page) {
  const btn = page.locator('#clearButton');
  if ((await btn.count()) === 0) return;
  const bb = await btn.boundingBox();
  const vw = page.viewportSize();
  if (!bb || !vw) return;
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.mouse.down();
  const tx = bb.x < vw.width / 2 ? vw.width * 0.9 : vw.width * 0.1;
  const ty = vw.height * 0.12;
  await page.mouse.move(tx, ty, { steps: 24 });
  await sleep(120);
  await page.mouse.up();
  await sleep(150);
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const throttleTag = throttle > 1 ? `${throttle}x` : 'raw';
  const outDir = join(ROOT, 'perf-profiles', `${stamp}-web-${deviceName}-${throttleTag}`);
  mkdirSync(outDir, { recursive: true });

  if (process.env.PERF_MARKS !== 'true') {
    console.warn(
      '! PERF_MARKS is not "true" — engine.* marks will be absent. Use `npm run perf:web`.'
    );
  }

  const { base, stop } = await buildAndPreview(port, { build });
  const browser = await chromium.launch({ headless: true });
  const t0 = Date.now();
  try {
    const ctx = await browser.newContext({
      viewport: { width: device.width, height: device.height },
      deviceScaleFactor: device.deviceScaleFactor,
      hasTouch: true,
      isMobile: false,
    });
    const page = await ctx.newPage();
    await injectObservers(page);
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.waitForSelector('#drawingCanvas');
    await sleep(400);

    const cdp = await ctx.newCDPSession(page);
    if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });

    const heapBefore = await heapBytes(page);
    const events = await startTrace(cdp);

    console.log(`Profiling web ${deviceName} @ ${throttleTag} throttle…`);
    await expandDrawer(page);
    const box = await canvasBox(page);

    await beat(page, 'boot-settle', () => sleep(700));
    await beat(page, 'draw-single', async () => {
      await pickColor(page, COLORS[0]);
      await drawStroke(
        page,
        box,
        zigzag(box.width * 0.15, box.height * 0.3, box.width * 0.85, 40, 24)
      );
      await drawStroke(
        page,
        box,
        circlePts(box.width * 0.5, box.height * 0.6, Math.min(box.width, box.height) * 0.22, 2)
      );
    });
    await beat(page, 'multi-finger-draw', () => multiFingerDraw(page));
    await beat(page, 'change-colors', async () => {
      for (const c of COLORS) {
        if (await pickColor(page, c)) {
          await drawStroke(
            page,
            box,
            arcPts(box.width * 0.5, box.height * 0.5, box.width * 0.3, 0, Math.PI)
          );
        }
      }
    });
    await beat(page, 'stroke-size', async () => {
      await setStrokeSize(page, 5);
      await drawStroke(
        page,
        box,
        zigzag(box.width * 0.2, box.height * 0.7, box.width * 0.8, 30, 20)
      );
      await setStrokeSize(page, 1);
      await drawStroke(
        page,
        box,
        zigzag(box.width * 0.2, box.height * 0.5, box.width * 0.8, 20, 20)
      );
    });
    await beat(page, 'erase', async () => {
      const eraser = page.locator('#eraserButton');
      if (await eraser.count()) await eraser.click();
      await sleep(150);
      await drawStroke(
        page,
        box,
        zigzag(box.width * 0.2, box.height * 0.6, box.width * 0.8, 40, 16)
      );
    });
    await beat(page, 'undo', () => undoToEmpty(page));
    await beat(page, 'clear', () => clearDrag(page));

    const obs = await readObservers(page);
    const heapAfter = await heapBytes(page);
    await stopTrace(cdp);

    await page.screenshot({ path: join(outDir, 'screenshot.png') });

    writeFileSync(join(outDir, 'trace.json'), JSON.stringify({ traceEvents: events }));
    const metrics = {
      settings: {
        target: 'web',
        device: deviceName,
        viewport: device,
        throttle: throttle > 1 ? throttle : 0,
        buildMode: build ? 'production-preview' : 'production-preview (reused build)',
        startedAt: new Date(t0).toISOString(),
        durationMs: Date.now() - t0,
      },
      longTasks: obs.longTasks,
      frames: obs.frames,
      heap: { beforeBytes: heapBefore ?? 0, afterBytes: heapAfter ?? obs.heapBytes ?? 0 },
    };
    writeFileSync(join(outDir, 'metrics.json'), JSON.stringify(metrics, null, 2));

    const summary = analyze(events, metrics);
    const report = renderReport(summary);
    writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
    writeFileSync(join(outDir, 'report.md'), report);

    console.log(`\n${report}\n`);
    console.log(`Artifacts: ${outDir}`);
  } finally {
    await browser.close();
    stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

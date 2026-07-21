// Replay a REAL finger-input recording (captured on-device with
// scripts/perf/ipad-recorder.js) through the engine under the profiler — so the
// harness measures actual human strokes (real op counts, real pacing) instead of
// synthetic squiggles.
//
//   npm run perf:replay -- --recording=perf-profiles/recordings/my-session.json
//   node scripts/perf/replay-scenario.mjs --recording=… --turbo --no-build
//
// It opens /dev/engine (which exposes window.__engine + getUndoDebug), sizes the
// canvas to the recorded device, replays the captured pointer stream + UI actions
// at their recorded timing (so frame pacing matches real drawing — unlike the
// synchronous synthetic driver), captures a CDP trace + engine marks, and reports
// how YOUR input landed on the snapshot stack (depth, live rasters, blob bytes).

import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ROOT, chromiumExecutablePath, sleep } from '../lib/utils.mjs';
import { buildAndPreview } from './preview.mjs';
import { startTrace, stopTrace, injectObservers, readObservers, heapBytes } from './capture.mjs';
import { analyze, renderReport } from './analyze.mjs';

// The app's "Size N" picker → engine px. Approximate (the recorder only sees the
// label); override here if the real mapping is ever needed for fidelity.
const SIZE_PX = { 1: 4, 2: 8, 3: 14, 4: 22, 5: 32 };

const args = process.argv.slice(2);
const flag = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : def;
};
const recordingPath = flag('recording', null);
const throttle = args.includes('--no-throttle') ? 1 : Number(flag('throttle', '0'));
const turbo = args.includes('--turbo');
const port = Number(flag('port', '4173'));
const build = !args.includes('--no-build');

if (!recordingPath) {
  console.error(
    'Usage: npm run perf:replay -- --recording=<recording.json> [--turbo] [--throttle=N]'
  );
  process.exit(1);
}

async function main() {
  process.env.PUBLIC_ENABLE_DEV_HARNESS = 'true';
  if (process.env.PERF_MARKS !== 'true') {
    console.warn(
      '! PERF_MARKS is not "true" — engine.* marks will be absent. Use `npm run perf:replay`.'
    );
  }

  const recording = JSON.parse(readFileSync(recordingPath, 'utf8'));
  const meta = recording.meta || {};
  const vp = meta.viewport || { w: 1024, h: 1366 };
  const dsf = Math.max(1, Math.round(meta.dpr || 2));
  const cssCanvas = meta.canvas || vp;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const tag = basename(recordingPath).replace(/\.json$/, '');
  const outDir = join(ROOT, 'perf-profiles', `${stamp}-replay-${tag}`);
  mkdirSync(outDir, { recursive: true });

  const { base, stop } = await buildAndPreview(port, { build });
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromiumExecutablePath(chromium),
  });
  const t0 = Date.now();
  try {
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: dsf,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await page.goto(`${base}dev/engine`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#engineCanvas');
    await page.waitForFunction(() => window.__engineReady === true);
    await page.evaluate(({ w, h }) => window.__engine.resizeTo(w, h), cssCanvas);
    await sleep(150);

    const cdp = await ctx.newCDPSession(page);
    if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });

    await injectObservers(page);
    const heapBefore = await heapBytes(page);
    const events = await startTrace(cdp);

    console.log(
      `Replaying ${recording.events.length} events from ${basename(recordingPath)} ` +
        `(${turbo ? 'turbo' : 'real-time'})…`
    );
    const replayed = await page.evaluate(replayInPage, {
      events: recording.events,
      recCanvas: cssCanvas,
      sizePx: SIZE_PX,
      turbo,
    });

    const debug = await page.evaluate(() =>
      window.__engine.getUndoDebug ? window.__engine.getUndoDebug() : null
    );
    const obs = await readObservers(page);
    const heapAfter = await heapBytes(page);
    await stopTrace(cdp);
    await page.screenshot({ path: join(outDir, 'screenshot.png') }).catch(() => {});

    const settings = {
      target: 'web/dev-engine (replay of real device input)',
      device: `recorded ${vp.w}×${vp.h} @ dpr ${meta.dpr}`,
      viewport: { width: vp.w, height: vp.h, deviceScaleFactor: dsf },
      throttle: throttle > 1 ? throttle : 0,
      buildMode: build ? 'production-preview' : 'production-preview (reused build)',
      captureMode: 'cdp-trace',
      recording: {
        file: basename(recordingPath),
        startedAt: meta.startedAt,
        ua: meta.ua,
        pacing: turbo ? 'turbo' : 'real-time',
      },
      startedAt: new Date(t0).toISOString(),
      durationMs: Date.now() - t0,
    };
    const metrics = {
      settings,
      longTasks: obs.longTasks,
      frames: obs.frames,
      heap: { beforeBytes: heapBefore ?? 0, afterBytes: heapAfter ?? obs.heapBytes ?? 0 },
    };
    writeFileSync(join(outDir, 'trace.json'), JSON.stringify({ traceEvents: events }));
    writeFileSync(join(outDir, 'metrics.json'), JSON.stringify(metrics, null, 2));

    const summary = analyze(events, metrics);
    writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
    writeFileSync(join(outDir, 'report.md'), renderReport(summary));

    const md = renderReplayReport({ settings, replayed, debug, summary });
    writeFileSync(join(outDir, 'replay-summary.md'), md);
    writeFileSync(
      join(outDir, 'replay-summary.json'),
      JSON.stringify({ settings, replayed, debug }, null, 2)
    );

    console.log(`\n${md}\n`);
    console.log(`Artifacts: ${outDir}`);
  } finally {
    await browser.close();
    stop();
  }
}

// Runs inside the page. Dispatches the recorded pointer stream on #engineCanvas
// (synthetic events don't coalesce → one move = one engine op, matching the live
// device) and maps UI actions onto the engine API. Real-time pacing uses the
// recorded timestamps (capped) so frame cadence matches actual drawing.
function replayInPage({ events, recCanvas, sizePx, turbo }) {
  const canvas = document.querySelector('#engineCanvas');
  const r = canvas.getBoundingClientRect();
  const sx = r.width / (recCanvas.w || r.width);
  const sy = r.height / (recCanvas.h || r.height);
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const raf = () => new Promise((res) => requestAnimationFrame(res));
  const E = window.__engine;
  let eraser = false;
  let magic = false;
  // Last ink brush (ADR-0067): what a color pick resumes. false = pen (the
  // app's default), true = crayon.
  let inkCrayon = false;
  let prevT = 0;
  let strokes = 0;
  let undos = 0;

  // Track the high-water mark of the snapshot stack, since a session that ends
  // on undo-to-empty would otherwise report 0/0 at the end. Snapshot after each
  // stroke commits and before each undo.
  const peak = { snapshots: 0, blobBytes: 0 };
  const snapPeak = () => {
    const d = E.getUndoDebug && E.getUndoDebug();
    if (!d) return;
    peak.snapshots = Math.max(peak.snapshots, d.snapshots);
    peak.blobBytes = Math.max(peak.blobBytes, d.blobBytes);
  };

  const fire = (e) => {
    const lifted = e.type === 'pointerup' || e.type === 'pointercancel';
    canvas.dispatchEvent(
      new PointerEvent(e.type, {
        pointerId: e.id,
        pointerType: e.pt || 'touch',
        isPrimary: e.id === 1,
        clientX: r.left + e.x * sx,
        clientY: r.top + e.y * sy,
        // Schema-2 recordings carry real buttons/pressure — needed to reproduce
        // e.g. a pen contact stream whose pointerdown WebKit merged away. Older
        // recordings synthesize the obvious values.
        buttons: e.b ?? (lifted ? 0 : 1),
        pressure: e.p ?? (lifted ? 0 : 0.5),
        bubbles: true,
        cancelable: true,
      })
    );
  };

  return (async () => {
    for (const e of events) {
      if (!turbo) {
        const dt = Math.min(Math.max(0, e.t - prevT), 250); // cap long idle gaps
        if (dt > 0) await sleep(dt);
        prevT = e.t;
      }
      if (e.kind === 'pointer') {
        // Schema-2 recordings capture every pointer event on the page; `on` marks
        // the ones a UI element (not the canvas) received. Those are diagnostics —
        // replaying them on the canvas would invent strokes that never happened.
        if (e.on) continue;
        if (e.type === 'pointerdown') strokes++;
        fire(e);
        if (e.type === 'pointerup' || e.type === 'pointercancel') snapPeak();
      } else if (e.kind === 'action') {
        if (e.name === 'color') {
          // A color pick exits the eraser/magic brush and resumes the last ink
          // brush (the app's selectInkBrush) — mirror it so post-pick strokes
          // replay with the renderer the device actually ran. This also repairs
          // legacy toggle-`eraser` recordings, whose color-exits-eraser was
          // never replayed.
          if (eraser || magic) {
            eraser = false;
            magic = false;
            E.setEraserMode(false);
            E.setMagicMode(false);
            E.setCrayonMode(inkCrayon);
          }
          E.setColor(e.value);
        } else if (e.name === 'size') E.setStrokeWidth(sizePx[e.value] || 8);
        else if (e.name === 'brush') {
          // Brush Menu selection (ADR-0067): idempotent, one action per pick.
          eraser = e.value === 'eraser';
          magic = e.value === 'magic';
          if (e.value === 'pen' || e.value === 'crayon') inkCrayon = e.value === 'crayon';
          E.setEraserMode(eraser);
          E.setMagicMode(magic);
          E.setCrayonMode(e.value === 'crayon');
        } else if (e.name === 'eraser')
          E.setEraserMode((eraser = !eraser)); // legacy pre-Brush-Menu recordings
        else if (e.name === 'undo') {
          snapPeak();
          undos++;
          E.undo();
        } else if (e.name === 'clear') E.clearCanvas();
        await raf();
      }
    }
    // Undos fire app-style above (not awaited), and deep blob-tier restores
    // settle asynchronously — so drain the undo queue before resolving, or the
    // tail engine.undo measures land after Tracing.end and vanish from the
    // hot-path table. One measure lands per completed restore; a no-op undo
    // (pressed on an empty stack) or a marks-less build never lands one, so a
    // stall cap (matching undo-scenarios' per-step wait) keeps those moving.
    if (undos > 0) {
      const landed = () => performance.getEntriesByName('engine.undo', 'measure').length;
      let seen = landed();
      let lastProgress = performance.now();
      while (landed() < undos && performance.now() - lastProgress < 5000) {
        await raf();
        const n = landed();
        if (n > seen) {
          seen = n;
          lastProgress = performance.now();
        }
      }
    }
    await raf();
    return { events: events.length, strokes, undos, peak };
  })();
}

const f1 = (n) => (n == null ? 'n/a' : n.toFixed(1));

function renderReplayReport({ settings, replayed, debug, summary }) {
  const hot = Object.fromEntries((summary.engineHotPaths || []).map((m) => [m.name, m]));
  const row = (m) =>
    m
      ? `${m.count} · total ${f1(m.totalMs)}ms · avg ${f1(m.avgMs)}ms · max ${f1(m.maxMs)}ms`
      : 'n/a';
  const out = [];
  out.push('# Real-input replay profile\n');
  out.push(
    `Recording **${settings.recording.file}** · captured on \`${(settings.recording.ua || '').slice(0, 60)}…\`\n` +
      `Replayed at **${settings.device}** · pacing **${settings.recording.pacing}** · ` +
      `throttle **${settings.throttle ? settings.throttle + '×' : 'none'}**\n`
  );
  out.push('## How your input was stored (getUndoDebug)\n');
  const peak = replayed.peak;
  if (peak) {
    out.push(
      `- Strokes (pointerdowns): **${replayed.strokes}**\n` +
        `- **Peak** snapshot stack (high-water mark): snapshots **${peak.snapshots}** · ` +
        `blob bytes **${Math.round(peak.blobBytes / 1024)} KB**\n` +
        `- End of session: snapshots **${debug?.snapshots ?? 'n/a'}** · blob KB ` +
        `**${debug ? Math.round(debug.blobBytes / 1024) : 'n/a'}** (0 means the session ended on undo-to-empty)`
    );
  } else {
    out.push('_getUndoDebug unavailable._');
  }
  out.push('\n## Engine cost during replay (user-timing marks)\n');
  out.push(`- engine.draw: ${row(hot['engine.draw'])}`);
  out.push(`- engine.snapshot: ${row(hot['engine.snapshot'])}`);
  out.push(`- engine.fold: ${row(hot['engine.fold'])}`);
  out.push(`- engine.undo: ${row(hot['engine.undo'])}`);
  out.push(`- engine.commit: ${row(hot['engine.commit'])}`);
  out.push(
    '\nSee report.md for full frame health / hot paths; ADR-0066 and the `profiling` skill for interpretation.\n'
  );
  return out.join('\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

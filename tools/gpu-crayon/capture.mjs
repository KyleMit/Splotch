#!/usr/bin/env node
// Capture the GPU crayon spike: run each renderer's scripted replay, screenshot
// the reference scene and a magnified detail crop, and write the timings beside
// them.
//
// Runs HEADED on purpose. Playwright's headless Chromium falls back to
// SwiftShader, which renders the scene correctly and times it meaninglessly —
// a software rasteriser cannot answer a question about fill rate. Even headed,
// a Mac is the `desktop-advisory` tier in the performance matrix: these numbers
// rank the three algorithms against each other, and none of them approve
// anything for the iPad.
//
// Usage: node tools/gpu-crayon/capture.mjs --url=http://localhost:5231

import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(HERE, 'output');

// The detail tile is upscaled with a nearest-neighbour kernel so the contact
// sheet shows the actual tooth texels rather than a resampler's opinion of
// them — the grain IS the thing being judged.
const DETAIL_ZOOM = 3;

// Three samples per renderer, because a single capture cannot support a claim
// about an improvement. Two runs of the untouched stamp renderer already moved
// its worst frame from 3.76 ms to 1.61 ms, which is larger than most of the
// differences an iteration is trying to produce.
const DEFAULT_REPEATS = 3;

function parseArgs(argv) {
  const url = argv.find((a) => a.startsWith('--url='))?.slice('--url='.length);
  const repeats = argv.find((a) => a.startsWith('--repeats='))?.slice('--repeats='.length);
  const label = argv.find((a) => a.startsWith('--label='))?.slice('--label='.length);
  const scale = argv.find((a) => a.startsWith('--scale='))?.slice('--scale='.length);
  // Headless Chromium has no GPU and falls back to SwiftShader, which is the
  // only way to measure what this costs on a device whose GPU is blocklisted,
  // unavailable, or software-emulated. The numbers are meaningless as a ranking
  // and are the whole point as a floor.
  const headless = argv.includes('--headless');
  return {
    baseUrl: url ?? 'http://localhost:5231',
    repeats: repeats ? Math.max(1, Number(repeats)) : DEFAULT_REPEATS,
    label: label ?? null,
    scale: scale ?? null,
    headless,
  };
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// Median of each percentile across runs, plus the observed spread of the
// headline figure — an iteration whose median moves less than the spread has
// not been shown to do anything.
function summarise(runs) {
  const pick = (metric, q) => runs.map((r) => r[metric]?.[q]).filter((v) => typeof v === 'number');
  const band = (metric) => {
    const p50 = pick(metric, 'p50');
    if (p50.length === 0) return null;
    return {
      p50: median(p50),
      p95: median(pick(metric, 'p95')),
      max: median(pick(metric, 'max')),
      p50Spread: Math.max(...p50) - Math.min(...p50),
      samples: p50.length,
    };
  };
  return {
    runs: runs.length,
    gpuMs: band('gpuMs'),
    presentMs: band('presentMs'),
    syncPaintMs: band('syncPaintMs'),
    cpuMs: band('cpuMs'),
    intervalMs: band('intervalMs'),
    frames: runs[0].frames,
    drawCalls: runs[0].drawCalls,
    primitives: runs[0].primitives,
    primitiveNoun: runs[0].primitiveNoun,
  };
}

async function capture({ baseUrl, repeats, label, scale, headless }) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage({
    viewport: { width: 1260, height: 1040 },
    deviceScaleFactor: 1,
  });

  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));

  const target = `${baseUrl}/dev/gpu-crayon${scale ? `?scale=${encodeURIComponent(scale)}` : ''}`;
  await page.goto(target, { waitUntil: 'load' });

  const harnessError = await page
    .locator('[data-testid="gpu-crayon-error"]')
    .textContent()
    .catch(() => null);
  if (harnessError) throw new Error(`harness reported: ${harnessError}`);

  await page.waitForFunction(() => Boolean(window.__gpuCrayon), null, { timeout: 20_000 });
  const meta = await page.evaluate(() => ({
    renderers: window.__gpuCrayon.renderers,
    scene: window.__gpuCrayon.scene,
    detailCrop: window.__gpuCrayon.detailCrop,
  }));

  const results = [];

  for (const renderer of meta.renderers) {
    process.stdout.write(`capturing ${renderer.id}… `);
    const runs = [];
    for (let sample = 0; sample < repeats; sample++) {
      runs.push(await page.evaluate((id) => window.__gpuCrayon.run(id), renderer.id));
      process.stdout.write('.');
    }
    const stats = summarise(runs);

    // Screenshots come from the LAST run, so the image and the final scene
    // state agree; every run draws the same scene from the same cleared paper.
    const fullPath = path.join(OUTPUT_DIR, `${renderer.id}.png`);
    // Whichever surface the active option owns — the GPU options share one
    // WebGL canvas, the CPU baseline has its own 2D one.
    await page.locator('[data-active-canvas]').screenshot({ path: fullPath });

    const { x, y, width, height } = meta.detailCrop;
    await sharp(fullPath)
      .extract({ left: x, top: y, width, height })
      .resize(width * DETAIL_ZOOM, height * DETAIL_ZOOM, { kernel: 'nearest' })
      .toFile(path.join(OUTPUT_DIR, `${renderer.id}-detail.png`));

    // WebP siblings so the contact sheet can inline them without a multi-megabyte
    // document.
    await sharp(fullPath)
      .resize({ width: 700 })
      .webp({ quality: 88 })
      .toFile(path.join(OUTPUT_DIR, `${renderer.id}.webp`));
    await sharp(path.join(OUTPUT_DIR, `${renderer.id}-detail.png`))
      .resize({ width: 700, kernel: 'nearest' })
      .webp({ quality: 90 })
      .toFile(path.join(OUTPUT_DIR, `${renderer.id}-detail.webp`));

    results.push({ ...renderer, stats, runs });
    const gpu = stats.gpuMs;
    const sync = stats.syncPaintMs;
    process.stdout.write(
      gpu && gpu.p50 > 0
        ? ` GPU p50 ${gpu.p50.toFixed(3)} ms (spread ${gpu.p50Spread.toFixed(3)}), p95 ${gpu.p95.toFixed(3)}, max ${gpu.max.toFixed(3)}\n`
        : sync
          ? ` sync-drained paint p50 ${sync.p50.toFixed(3)} ms, p95 ${sync.p95.toFixed(3)}, max ${sync.max.toFixed(3)} (upper bound)\n`
          : ` no GL work\n`
    );
  }

  const userAgent = await page.evaluate(() => navigator.userAgent);
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });

  await browser.close();

  const report = {
    capturedAt: new Date().toISOString(),
    label,
    branch: execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: path.join(HERE, '..', '..'),
      encoding: 'utf8',
    }).trim(),
    commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: path.join(HERE, '..', '..'),
      encoding: 'utf8',
    }).trim(),
    repeats,
    sceneScale: meta.scene.scale,
    softwareRendered: headless,
    userAgent,
    gpu,
    scene: meta.scene,
    results,
  };
  await writeFile(path.join(OUTPUT_DIR, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);

  if (consoleErrors.length > 0) {
    console.warn(`\n${consoleErrors.length} console error(s):`);
    for (const line of consoleErrors.slice(0, 10)) console.warn(`  ${line}`);
  }
  console.log(`\nwrote ${OUTPUT_DIR}`);
  return report;
}

capture(parseArgs(process.argv.slice(2))).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

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

function parseArgs(argv) {
  const url = argv.find((a) => a.startsWith('--url='))?.slice('--url='.length);
  return { baseUrl: url ?? 'http://localhost:5231' };
}

async function capture({ baseUrl }) {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({
    viewport: { width: 1260, height: 1040 },
    deviceScaleFactor: 1,
  });

  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));

  await page.goto(`${baseUrl}/dev/gpu-crayon`, { waitUntil: 'load' });

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
    const stats = await page.evaluate((id) => window.__gpuCrayon.run(id), renderer.id);

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

    results.push({ ...renderer, stats });
    process.stdout.write(`${stats.frames} frames, JS p95 ${stats.cpuMs.p95.toFixed(2)} ms\n`);
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

#!/usr/bin/env node

import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { join, resolve } from 'node:path';
import { PALETTE_COLORS } from '../../web/src/lib/palette.ts';
import { ROOT, isMain } from '../lib/proc.mjs';
import { chromiumExecutablePath } from '../lib/playwright.mjs';
import {
  ensureDevServer,
  openAppPage,
  canvasBox,
  expandDrawer,
} from '../app-driver/lib/app-driver.mjs';
import { fitInstructionScene, sceneStrokePoints } from './lib/drawing-instructions.mjs';
import { STORE_DRAWINGS, STORE_DRAWING_SCENES } from './generated/store-drawings.mjs';

const DEFAULT_INPUT = join(ROOT, 'tools/store-drawings/samples');
const DEFAULT_OUTPUT = join(ROOT, 'screenshots/store-drawing-eval');
const PORT = 4173;
const GEOMETRY_STROKE_PX = 8;
const STROKE_WIDTH_PX = { 1: 2, 2: 4, 3: 8, 4: 14, 5: 22 };
const DEVICES = {
  tall: { width: 432, height: 768, deviceScaleFactor: 1 },
  wide: { width: 1280, height: 720, deviceScaleFactor: 1 },
};

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function selectionHex(selection) {
  if (selection.kind === 'picker') return selection.hex;
  const palette = PALETTE_COLORS.find(({ label }) => label === selection.label);
  if (!palette) throw new Error(`Unknown palette label ${selection.label}`);
  return palette.hex;
}

function instructionSvg(scene, box, geometryOnly = false) {
  const body = scene.strokes.map((stroke) => {
    const points = sceneStrokePoints(scene, box, stroke);
    const color = geometryOnly ? '#000000' : selectionHex(scene.colors[stroke.color]);
    const width = geometryOnly ? GEOMETRY_STROKE_PX : STROKE_WIDTH_PX[stroke.size];
    if (points.length === 1) {
      return `<circle cx="${points[0].x}" cy="${points[0].y}" r="${width / 2}" fill="${color}"/>`;
    }
    const coordinates = points.map(({ x, y }) => `${x},${y}`).join(' ');
    return `<polyline points="${escapeXml(coordinates)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${box.width}" height="${box.height}" viewBox="0 0 ${box.width} ${box.height}">${body.join('')}</svg>`;
}

function geometrySvg(source, sourceStrokeWidth) {
  return source
    .replaceAll(/stroke="#[0-9a-fA-F]{6}"/g, 'stroke="#000000"')
    .replaceAll(/stroke-width="[^"]+"/g, `stroke-width="${sourceStrokeWidth}"`);
}

async function renderSvg(source, width, height) {
  return sharp(Buffer.from(source))
    .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function rgbaPlane(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { rgba: data, width: info.width, height: info.height };
}

function alphaPlane({ rgba, width, height }) {
  const alpha = new Uint8Array(width * height);
  for (let source = 3, target = 0; source < rgba.length; source += 4, target++)
    alpha[target] = rgba[source];
  return { alpha, width, height };
}

function softMaskMetrics(reference, actual) {
  if (reference.width !== actual.width || reference.height !== actual.height) {
    throw new Error('Compared masks have different dimensions');
  }
  let intersection = 0;
  let union = 0;
  let referenceMass = 0;
  let actualMass = 0;
  for (let index = 0; index < reference.alpha.length; index++) {
    const expected = reference.alpha[index] / 255;
    const observed = actual.alpha[index] / 255;
    intersection += Math.min(expected, observed);
    union += Math.max(expected, observed);
    referenceMass += expected;
    actualMass += observed;
  }
  return {
    iou: union === 0 ? 1 : intersection / union,
    recall: referenceMass === 0 ? 1 : intersection / referenceMass,
    precision: actualMass === 0 ? 1 : intersection / actualMass,
  };
}

export function softColorMetrics(reference, actual) {
  if (reference.width !== actual.width || reference.height !== actual.height) {
    throw new Error('Compared images have different dimensions');
  }
  let intersection = 0;
  let union = 0;
  let referenceMass = 0;
  let actualMass = 0;
  for (let index = 0; index < reference.rgba.length; index += 4) {
    const expectedAlpha = reference.rgba[index + 3] / 255;
    const observedAlpha = actual.rgba[index + 3] / 255;
    const overlap = Math.min(expectedAlpha, observedAlpha);
    const largestChannelDifference = Math.max(
      Math.abs(reference.rgba[index] - actual.rgba[index]),
      Math.abs(reference.rgba[index + 1] - actual.rgba[index + 1]),
      Math.abs(reference.rgba[index + 2] - actual.rgba[index + 2])
    );
    const colorSimilarity = 1 - largestChannelDifference / 255;
    intersection += overlap * colorSimilarity;
    union += Math.max(expectedAlpha, observedAlpha);
    referenceMass += expectedAlpha;
    actualMass += observedAlpha;
  }
  return {
    iou: union === 0 ? 1 : intersection / union,
    recall: referenceMass === 0 ? 1 : intersection / referenceMass,
    precision: actualMass === 0 ? 1 : intersection / actualMass,
  };
}

async function maskOverlay(reference, actual) {
  const output = Buffer.alloc(reference.width * reference.height * 4);
  for (let index = 0; index < reference.alpha.length; index++) {
    const target = index * 4;
    output[target] = reference.alpha[index];
    output[target + 1] = Math.min(reference.alpha[index], actual.alpha[index]);
    output[target + 2] = actual.alpha[index];
    output[target + 3] = Math.max(reference.alpha[index], actual.alpha[index]);
  }
  return sharp(output, { raw: { width: reference.width, height: reference.height, channels: 4 } })
    .png()
    .toBuffer();
}

async function captureLiveDrawing(page) {
  const dataUrl = await page.evaluate(() => {
    const input = document.getElementById('drawingCanvas');
    if (!(input instanceof HTMLCanvasElement)) throw new Error('Drawing canvas is unavailable');
    const inputBounds = input.getBoundingClientRect();
    const output = document.createElement('canvas');
    output.width = Math.round(inputBounds.width);
    output.height = Math.round(inputBounds.height);
    const context = output.getContext('2d');
    if (!context) throw new Error('Could not create drawing capture context');
    for (const tile of document.querySelectorAll('canvas[data-live-tile]:not([hidden])')) {
      if (!(tile instanceof HTMLCanvasElement)) continue;
      const bounds = tile.getBoundingClientRect();
      context.drawImage(
        tile,
        bounds.left - inputBounds.left,
        bounds.top - inputBounds.top,
        bounds.width,
        bounds.height
      );
    }
    return output.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
}

function percentage(value) {
  return `${(value * 100).toFixed(1)}%`;
}

async function evaluateDrawing(browser, base, input, output, key) {
  const orientation = key.endsWith('-tall') ? 'tall' : 'wide';
  const scene = STORE_DRAWING_SCENES[key];
  const draw = STORE_DRAWINGS[key];
  if (!scene || !draw) throw new Error(`Unknown store drawing ${key}`);
  const { ctx, page } = await openAppPage(browser, base, DEVICES[orientation]);
  await expandDrawer(page);
  const box = await canvasBox(page);
  await draw(page, box);
  const actualPng = await captureLiveDrawing(page);
  await ctx.close();

  const width = Math.round(box.width);
  const height = Math.round(box.height);
  const source = await readFile(join(input, `${key}.svg`), 'utf8');
  const originalPng = await renderSvg(source, width, height);
  const sourceGeometryPng = await renderSvg(
    geometrySvg(source, GEOMETRY_STROKE_PX / fitInstructionScene(scene, box).scale),
    width,
    height
  );
  const instructionPng = await renderSvg(instructionSvg(scene, box), width, height);
  const instructionGeometryPng = await renderSvg(instructionSvg(scene, box, true), width, height);

  const sourceGeometry = alphaPlane(await rgbaPlane(sourceGeometryPng));
  const instructionGeometry = alphaPlane(await rgbaPlane(instructionGeometryPng));
  const instructionPixels = await rgbaPlane(instructionPng);
  const actualPixels = await rgbaPlane(actualPng);
  const originalPixels = await rgbaPlane(originalPng);
  const instructionMask = alphaPlane(instructionPixels);
  const actualMask = alphaPlane(actualPixels);
  const metrics = {
    geometry: softMaskMetrics(sourceGeometry, instructionGeometry),
    runtime: softColorMetrics(instructionPixels, actualPixels),
    sourceVisual: softColorMetrics(originalPixels, actualPixels),
  };
  const drawingOutput = join(output, key);
  await mkdir(drawingOutput, { recursive: true });
  await Promise.all([
    writeFile(join(drawingOutput, 'source.png'), originalPng),
    writeFile(join(drawingOutput, 'instructions.png'), instructionPng),
    writeFile(join(drawingOutput, 'actual.png'), actualPng),
    writeFile(
      join(drawingOutput, 'geometry-overlay.png'),
      await maskOverlay(sourceGeometry, instructionGeometry)
    ),
    writeFile(
      join(drawingOutput, 'runtime-overlay.png'),
      await maskOverlay(instructionMask, actualMask)
    ),
    writeFile(join(drawingOutput, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`),
  ]);
  console.log(
    `${key}: geometry ${percentage(metrics.geometry.iou)}, runtime ${percentage(metrics.runtime.iou)}, source ${percentage(metrics.sourceVisual.iou)}`
  );
  return { key, ...metrics };
}

export async function evaluateStoreDrawings({
  input = DEFAULT_INPUT,
  output = DEFAULT_OUTPUT,
  keys,
} = {}) {
  const selected = keys?.length ? keys : Object.keys(STORE_DRAWINGS);
  await mkdir(output, { recursive: true });
  const { base, stop } = await ensureDevServer(PORT);
  let browser;
  try {
    browser = await chromium.launch({ executablePath: chromiumExecutablePath(chromium) });
    const results = [];
    for (const key of selected)
      results.push(await evaluateDrawing(browser, base, input, output, key));
    const rows = results.map(
      ({ key, geometry, runtime, sourceVisual }) =>
        `| ${key} | ${percentage(geometry.iou)} | ${percentage(runtime.iou)} | ${percentage(sourceVisual.iou)} |`
    );
    const report = [
      '# Store drawing instruction fidelity',
      '',
      '| Drawing | SVG→points geometry IoU | Points→app color-aware IoU | SVG→app color-aware IoU |',
      '| --- | ---: | ---: | ---: |',
      ...rows,
      '',
      `Geometry compares ${GEOMETRY_STROKE_PX}-pixel centerlines. Runtime and visual scores compare both coverage and RGB color, so equal silhouettes with different colors do not match. Red-only pixels in the occupancy overlays belong to the reference, blue-only pixels belong to the generated or runtime result, and overlap is purple-white.`,
      '',
    ].join('\n');
    await writeFile(join(output, 'report.md'), report);
    return results;
  } finally {
    if (browser) await browser.close();
    stop();
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      input: { type: 'string', default: DEFAULT_INPUT },
      output: { type: 'string', default: DEFAULT_OUTPUT },
    },
  });
  await evaluateStoreDrawings({
    input: resolve(values.input),
    output: resolve(values.output),
    keys: positionals,
  });
}

if (isMain(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

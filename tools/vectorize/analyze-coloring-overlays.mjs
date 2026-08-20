#!/usr/bin/env node

import { gzipSync } from 'node:zlib';
import { existsSync, globSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { ROOT, isMain, runMain } from '../lib/proc.mjs';

const MIN_BINARY_IOU = 0.96;
const MAX_ALPHA_MEAN_ABSOLUTE_ERROR = 3;

async function sourceAlpha(path, width, height) {
  const luma = await sharp(path)
    .resize(width, height, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer();
  return Uint8Array.from(luma, (value) => 255 - value);
}

async function vectorAlpha(path, width, height) {
  const rgba = await sharp(path, { density: 192 })
    .resize(width, height, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const alpha = new Uint8Array(width * height);
  for (let index = 0; index < alpha.length; index += 1) alpha[index] = rgba[index * 4 + 3];
  return alpha;
}

export function compareOverlayAlpha(reference, candidate) {
  let absoluteError = 0;
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  for (let index = 0; index < reference.length; index += 1) {
    absoluteError += Math.abs(reference[index] - candidate[index]);
    const referenceInk = reference[index] >= 128;
    const candidateInk = candidate[index] >= 128;
    if (referenceInk && candidateInk) truePositive += 1;
    else if (!referenceInk && candidateInk) falsePositive += 1;
    else if (referenceInk) falseNegative += 1;
  }
  return {
    meanAbsoluteError: absoluteError / reference.length,
    binaryPrecision: truePositive / (truePositive + falsePositive),
    binaryRecall: truePositive / (truePositive + falseNegative),
    binaryIou: truePositive / (truePositive + falsePositive + falseNegative),
  };
}

function paths(svg) {
  const source = svg.replace(/\.overlay\.svg$/, '.outline.webp');
  const full = svg.replace(/\.overlay\.svg$/, '.overlay.webp');
  const compact = full.replace('web/static/coloring/', 'web/static/coloring/max-1152px/');
  return { source, full, compact };
}

async function analyze(svg) {
  const related = paths(svg);
  const metadata = await sharp(resolve(ROOT, related.source)).metadata();
  const width = metadata.width;
  const height = metadata.height;
  const reference = await sourceAlpha(resolve(ROOT, related.source), width, height);
  const candidate = await vectorAlpha(resolve(ROOT, svg), width, height);
  const bytes = readFileSync(resolve(ROOT, svg));
  const fidelity = compareOverlayAlpha(reference, candidate);
  return {
    svg,
    dimensions: `${width}x${height}`,
    shapes: [...bytes.toString().matchAll(/<(path|rect|circle|ellipse|polygon|polyline|line)\b/g)]
      .length,
    bytes: {
      svg: bytes.length,
      svgGzip: gzipSync(bytes, { level: 9 }).length,
      webpFull: existsSync(resolve(ROOT, related.full))
        ? statSync(resolve(ROOT, related.full)).size
        : null,
      webpCompact: existsSync(resolve(ROOT, related.compact))
        ? statSync(resolve(ROOT, related.compact)).size
        : null,
    },
    fidelity,
    passed:
      fidelity.binaryIou >= MIN_BINARY_IOU &&
      fidelity.meanAbsoluteError <= MAX_ALPHA_MEAN_ABSOLUTE_ERROR,
  };
}

function sum(rows, select) {
  return rows.reduce((total, row) => total + (select(row) ?? 0), 0);
}

export async function analyzeColoringOverlays(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: { book: { type: 'string' } },
  });
  const pattern = values.book
    ? `web/static/coloring/${values.book}/*.overlay.svg`
    : 'web/static/coloring/**/*.overlay.svg';
  const svgs = globSync(pattern, { cwd: ROOT })
    .filter((path) => !path.endsWith('.dark.overlay.svg'))
    .sort();
  if (svgs.length === 0) throw new Error(`No light coloring overlay SVGs matched ${pattern}`);
  const rows = [];
  for (const svg of svgs) rows.push(await analyze(svg));
  const failed = rows.filter((row) => !row.passed);
  const report = {
    thresholds: {
      minBinaryIou: MIN_BINARY_IOU,
      maxAlphaMeanAbsoluteError: MAX_ALPHA_MEAN_ABSOLUTE_ERROR,
    },
    summary: {
      count: rows.length,
      failed: failed.length,
      svgBytes: sum(rows, (row) => row.bytes.svg),
      svgGzipBytes: sum(rows, (row) => row.bytes.svgGzip),
      webpFullBytes: sum(rows, (row) => row.bytes.webpFull),
      webpCompactBytes: sum(rows, (row) => row.bytes.webpCompact),
      minimumBinaryIou: Math.min(...rows.map((row) => row.fidelity.binaryIou)),
      maximumAlphaMeanAbsoluteError: Math.max(...rows.map((row) => row.fidelity.meanAbsoluteError)),
    },
    rows,
  };
  const suffix = values.book ?? 'catalog';
  const output = resolve(ROOT, `vectorized/coloring-overlays/analysis-${suffix}.json`);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.summary, null, 2));
  if (failed.length > 0) {
    throw new Error(
      `${failed.length} coloring SVG(s) failed fidelity thresholds:\n${failed.map((row) => row.svg).join('\n')}`
    );
  }
  return report;
}

if (isMain(import.meta.url)) runMain(() => analyzeColoringOverlays());

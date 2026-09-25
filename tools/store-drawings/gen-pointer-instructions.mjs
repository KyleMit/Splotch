#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { PALETTE_COLORS } from '../../web/src/lib/palette.ts';
import { COLOR_FAMILIES } from '../../web/src/lib/hexPickerLayout.ts';
import { isMain, ROOT } from '../lib/proc.mjs';

const DEFAULT_INPUT = join(ROOT, 'tools/store-drawings/samples');
const DEFAULT_OUTPUT = join(ROOT, 'tools/store-drawings/generated/store-drawings.mjs');
const FLATTEN_TOLERANCE = 0.25;
const MAX_FLATTEN_DEPTH = 12;
const POINT_PRECISION = 0.25;
const STROKE_WIDTHS = [2, 4, 8, 14, 22];
const PORTRAIT_CANVASES = [
  { width: 432, height: 693 },
  { width: 430, height: 857 },
];
const LANDSCAPE_CANVASES = [
  { width: 1196, height: 720 },
  { width: 1282, height: 1024 },
];
const PORTRAIT_PICKER_SHADE_INDEXES = new Set([0, 2, 4, 6, 8]);
const PORTRAIT_PALETTE_LABELS = new Set(['Purple', 'Blue', 'Green', 'Yellow', 'Black']);
const LANDSCAPE_PALETTE_LABELS = new Set([
  'Purple',
  'Blue',
  'Green',
  'Yellow',
  'Orange',
  'Red',
  'Pink',
  'Black',
]);
const XML_ATTRIBUTES = new Set(['version', 'encoding', 'standalone']);
const SVG_ATTRIBUTES = new Set(['xmlns', 'version', 'viewBox']);
const GROUP_ATTRIBUTES = new Set(['fill', 'stroke', 'stroke-linecap', 'stroke-linejoin']);
const PATH_ATTRIBUTES = new Set(['d', 'stroke-width']);

function parseAttributes(source, accepted, filename, element) {
  const attributes = {};
  let index = 0;
  while (source.slice(index).trim()) {
    const match = source.slice(index).match(/^\s+([:\w-]+)\s*=\s*"([^"]*)"/);
    if (!match) throw new Error(`${filename}: malformed ${element} attributes`);
    const [, name, value] = match;
    if (!accepted.has(name)) {
      throw new Error(`${filename}: unsupported attribute ${name} on ${element}`);
    }
    if (Object.hasOwn(attributes, name)) {
      throw new Error(`${filename}: duplicate attribute ${name} on ${element}`);
    }
    attributes[name] = value;
    index += match[0].length;
  }
  return attributes;
}

function parseNumberList(source) {
  return [...source.matchAll(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g)].map((match) =>
    Number(match[0])
  );
}

function pointLineDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  return (
    Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x) / Math.hypot(dx, dy)
  );
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function flattenCubic(start, control1, control2, end, points, depth = 0) {
  const flatness = Math.max(
    pointLineDistance(control1, start, end),
    pointLineDistance(control2, start, end)
  );
  if (flatness <= FLATTEN_TOLERANCE || depth >= MAX_FLATTEN_DEPTH) {
    points.push(end);
    return;
  }
  const a = midpoint(start, control1);
  const b = midpoint(control1, control2);
  const c = midpoint(control2, end);
  const d = midpoint(a, b);
  const e = midpoint(b, c);
  const split = midpoint(d, e);
  flattenCubic(start, a, d, split, points, depth + 1);
  flattenCubic(split, e, c, end, points, depth + 1);
}

function tokenizePath(source) {
  return [...source.matchAll(/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g)].map(
    (match) => match[0]
  );
}

export function flattenSvgPath(source) {
  const tokens = tokenizePath(source);
  const points = [];
  let index = 0;
  let command;
  let current;
  let start;
  const number = () => {
    const token = tokens[index++];
    if (token === undefined || /[A-Za-z]/.test(token)) {
      throw new Error(`Expected a number in SVG path, received ${token ?? 'end of path'}`);
    }
    return Number(token);
  };
  while (index < tokens.length) {
    if (/[A-Za-z]/.test(tokens[index])) command = tokens[index++];
    if (command === 'M') {
      current = { x: number(), y: number() };
      start = current;
      points.push(current);
      command = undefined;
      continue;
    }
    if (command === 'C') {
      if (!current) throw new Error('Cubic path command has no starting point');
      while (index < tokens.length && !/[A-Za-z]/.test(tokens[index])) {
        const control1 = { x: number(), y: number() };
        const control2 = { x: number(), y: number() };
        const end = { x: number(), y: number() };
        flattenCubic(current, control1, control2, end, points);
        current = end;
      }
      command = undefined;
      continue;
    }
    if (command === 'Z') {
      if (start && current && (start.x !== current.x || start.y !== current.y)) points.push(start);
      current = start;
      command = undefined;
      continue;
    }
    throw new Error(`Unsupported SVG path command ${command ?? tokens[index]}`);
  }
  return points;
}

function srgbChannel(value) {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function oklab(hex) {
  const value = hex.replace('#', '');
  const r = srgbChannel(Number.parseInt(value.slice(0, 2), 16));
  const g = srgbChannel(Number.parseInt(value.slice(2, 4), 16));
  const b = srgbChannel(Number.parseInt(value.slice(4, 6), 16));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function colorDistance(a, b) {
  const first = oklab(a);
  const second = oklab(b);
  return Math.hypot(first.l - second.l, first.a - second.a, first.b - second.b);
}

function colorCandidates(orientation) {
  const paletteLabels = orientation === 'tall' ? PORTRAIT_PALETTE_LABELS : LANDSCAPE_PALETTE_LABELS;
  const palette = PALETTE_COLORS.filter(({ label }) => paletteLabels.has(label)).map(
    ({ hex, label }) => ({ hex, instruction: { kind: 'palette', label } })
  );
  const picker = COLOR_FAMILIES.flatMap((family) =>
    family.shades.flatMap((hex, shadeIndex) =>
      orientation === 'wide' || PORTRAIT_PICKER_SHADE_INDEXES.has(shadeIndex)
        ? [{ hex, instruction: { kind: 'picker', hex } }]
        : []
    )
  );
  return [...palette, ...picker];
}

function closestColor(hex, orientation) {
  return colorCandidates(orientation).reduce(
    (best, candidate) => {
      const distance = colorDistance(hex, candidate.hex);
      return distance < best.distance ? { ...candidate, distance } : best;
    },
    { distance: Number.POSITIVE_INFINITY }
  ).instruction;
}

function closestStrokeSize(target) {
  let bestIndex = 0;
  for (let index = 1; index < STROKE_WIDTHS.length; index++) {
    if (Math.abs(STROKE_WIDTHS[index] - target) < Math.abs(STROKE_WIDTHS[bestIndex] - target)) {
      bestIndex = index;
    }
  }
  return bestIndex + 1;
}

function polylineLength(points) {
  let length = 0;
  for (let index = 2; index + 1 < points.length; index += 2) {
    length += Math.hypot(points[index] - points[index - 2], points[index + 1] - points[index - 1]);
  }
  return length;
}

// The tracer emits piecewise widths, so one drawn line arrives as many segments whose widths drift.
// Weighting by length keeps a long segment from being outvoted by the short ones around it.
function lengthWeightedStrokeSize(segments) {
  let weighted = 0;
  let total = 0;
  for (const segment of segments) {
    const length = segment.length || Number.EPSILON;
    weighted += length * segment.targetWidth;
    total += length;
  }
  return closestStrokeSize(weighted / total);
}

// A segment may keep the run's pen while its width stays within one pen step of it. Widths that
// merely drift across a rounding boundary stay in one run; a real taper crosses a whole step and
// starts a new one. The outermost pens have no neighbour on one side, so they mirror the step on
// the side they do have — an unbounded band there would swallow an arbitrarily wider segment.
function strokeSizeBand(size) {
  const width = STROKE_WIDTHS[size - 1];
  const below = STROKE_WIDTHS[size - 2] ?? width - (STROKE_WIDTHS[size] - width);
  const above = STROKE_WIDTHS[size] ?? width + (width - STROKE_WIDTHS[size - 2]);
  return { low: Math.max(below, 0), high: above };
}

function segmentsShareStrokeSize(segments) {
  const size = lengthWeightedStrokeSize(segments);
  const { low, high } = strokeSizeBand(size);
  return segments.every((segment) => segment.targetWidth >= low && segment.targetWidth <= high)
    ? size
    : null;
}

function joinsPrevious(previousPoints, points) {
  return previousPoints.at(-2) === points[0] && previousPoints.at(-1) === points[1];
}

// Splits a chain of joined segments into the fewest runs that each hold one pen size, then emits
// one stroke per run. Quantizing per run rather than per segment is what collapses a line whose
// width straddles a pen boundary from a burst of one-dab strokes into a single pointer stroke.
function strokesForChain(chain, color) {
  const strokes = [];
  let run = [];
  const flush = () => {
    if (run.length === 0) return;
    const points = run[0].points.slice();
    for (const segment of run.slice(1)) points.push(...segment.points.slice(2));
    strokes.push({ color, size: lengthWeightedStrokeSize(run), points });
    run = [];
  };
  for (const segment of chain) {
    if (run.length === 0) {
      run.push(segment);
      continue;
    }
    if (segmentsShareStrokeSize([...run, segment]) === null) flush();
    run.push(segment);
  }
  flush();
  return strokes;
}

function canonicalScale(width, height, orientation) {
  const canvases = orientation === 'tall' ? PORTRAIT_CANVASES : LANDSCAPE_CANVASES;
  return (
    canvases.reduce(
      (total, canvas) => total + Math.min(canvas.width / width, canvas.height / height),
      0
    ) / canvases.length
  );
}

function quantizePoints(points) {
  const values = [];
  for (const point of points) {
    const x = Math.round(point.x / POINT_PRECISION) * POINT_PRECISION;
    const y = Math.round(point.y / POINT_PRECISION) * POINT_PRECISION;
    if (values.at(-2) === x && values.at(-1) === y) continue;
    values.push(x, y);
  }
  return values;
}

function nameParts(filename) {
  const match = basename(filename, '.svg').match(/^([a-z][a-z0-9-]*)-(tall|wide)$/);
  if (!match) throw new Error(`${filename}: expected a name ending in -tall.svg or -wide.svg`);
  const words = match[1].split('-');
  const pascal = [...words, match[2]].map((word) => word[0].toUpperCase() + word.slice(1)).join('');
  return {
    key: [...words, match[2]].join('-'),
    functionName: `draw${pascal}`,
    orientation: match[2],
  };
}

export function convertSvg(source, filename) {
  const tags = [...source.matchAll(/<\/?([A-Za-z][\w:-]*)\b/g)].map((match) => match[1]);
  const unsupportedTags = [...new Set(tags.filter((tag) => !['svg', 'g', 'path'].includes(tag)))];
  if (unsupportedTags.length > 0)
    throw new Error(`${filename}: unsupported tags ${unsupportedTags}`);
  let document = source.trim();
  const declarationMatch = document.match(/^<\?xml\b([^?]*)\?>/);
  if (declarationMatch) {
    parseAttributes(declarationMatch[1], XML_ATTRIBUTES, filename, 'XML declaration');
    document = document.slice(declarationMatch[0].length).trim();
  }
  const svgMatch = document.match(/^<svg\b([^>]*)>([\s\S]*)<\/svg>$/);
  if (!svgMatch) throw new Error(`${filename}: expected one svg root`);
  const svg = parseAttributes(svgMatch[1], SVG_ATTRIBUTES, filename, 'svg');
  const viewBox = parseNumberList(svg.viewBox ?? '');
  if (viewBox.length !== 4 || viewBox[0] !== 0 || viewBox[1] !== 0) {
    throw new Error(`${filename}: expected a zero-origin four-number viewBox`);
  }
  const [, , width, height] = viewBox;
  const names = nameParts(filename);
  const colors = [];
  const colorIndexes = new Map();
  const strokes = [];
  const scale = canonicalScale(width, height, names.orientation);
  const groupPattern = /<g\b([^>]*)>([\s\S]*?)<\/g>/g;
  const groupMatches = [...svgMatch[2].matchAll(groupPattern)];
  if (svgMatch[2].replace(groupPattern, '').trim()) {
    throw new Error(`${filename}: svg root may contain only groups`);
  }
  for (const groupMatch of groupMatches) {
    const group = parseAttributes(groupMatch[1], GROUP_ATTRIBUTES, filename, 'g');
    if (
      group.fill !== 'none' ||
      !/^#[0-9a-fA-F]{6}$/.test(group.stroke ?? '') ||
      group['stroke-linecap'] !== 'round' ||
      group['stroke-linejoin'] !== 'round'
    ) {
      throw new Error(
        `${filename}: every group must have a hex stroke and be unfilled with round caps and joins`
      );
    }
    const selectedColor = closestColor(group.stroke, names.orientation);
    const colorKey = JSON.stringify(selectedColor);
    if (!colorIndexes.has(colorKey)) {
      colorIndexes.set(colorKey, colors.length);
      colors.push(selectedColor);
    }
    const pathPattern = /<path\b([^>]*)\/>/g;
    const pathMatches = [...groupMatch[2].matchAll(pathPattern)];
    if (groupMatch[2].replace(pathPattern, '').trim()) {
      throw new Error(`${filename}: groups may contain only self-closing paths`);
    }
    if (pathMatches.length === 0) throw new Error(`${filename}: group contains no paths`);
    const chains = [];
    for (const pathMatch of pathMatches) {
      const path = parseAttributes(pathMatch[1], PATH_ATTRIBUTES, filename, 'path');
      if (!path.d || !path['stroke-width'])
        throw new Error(`${filename}: path is missing d or stroke-width`);
      const strokeWidth = Number(path['stroke-width']);
      if (!Number.isFinite(strokeWidth) || strokeWidth <= 0) {
        throw new Error(`${filename}: path stroke-width must be a positive number`);
      }
      const points = quantizePoints(flattenSvgPath(path.d));
      if (points.length < 2) throw new Error(`${filename}: path produced no pointer coordinates`);
      const segment = { points, targetWidth: strokeWidth * scale, length: polylineLength(points) };
      const openChain = chains.at(-1);
      if (openChain && joinsPrevious(openChain.at(-1).points, points)) openChain.push(segment);
      else chains.push([segment]);
    }
    for (const chain of chains) {
      strokes.push(...strokesForChain(chain, colorIndexes.get(colorKey)));
    }
  }
  if (strokes.length === 0) throw new Error(`${filename}: no strokes found`);
  return { ...names, width, height, colors, strokes };
}

function formatValue(value, indent = 0) {
  if (!Array.isArray(value) && (value === null || typeof value !== 'object'))
    return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.every((entry) => typeof entry === 'number')) return `[${value.join(',')}]`;
    if (value.length === 0) return '[]';
    const inner = value.map(
      (entry) => `${' '.repeat(indent + 2)}${formatValue(entry, indent + 2)}`
    );
    return `[\n${inner.join(',\n')}\n${' '.repeat(indent)}]`;
  }
  const entries = Object.entries(value).map(
    ([key, entry]) => `${' '.repeat(indent + 2)}${key}: ${formatValue(entry, indent + 2)}`
  );
  return `{\n${entries.join(',\n')}\n${' '.repeat(indent)}}`;
}

export function generateModule(drawings) {
  // Relative to the emitted module in generated/, not to this generator. Kept in a variable so the
  // tools/tests/tool-specifier-resolution.test.mjs guard doesn't read this emitted string as this
  // file's own import: it resolves from generated/, but from here it would point at tools/lib/.
  const drawingInstructionsSpecifier = '../lib/drawing-instructions.mjs';
  const blocks = [`import { drawInstructionScene } from '${drawingInstructionsSpecifier}';`, ''];
  for (const drawing of drawings) {
    const constant = drawing.functionName
      .replace(/^draw/, '')
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .toUpperCase();
    blocks.push(
      `const ${constant} = ${formatValue({
        width: drawing.width,
        height: drawing.height,
        colors: drawing.colors,
        strokes: drawing.strokes,
      })};`
    );
    blocks.push('');
    blocks.push(`export function ${drawing.functionName}(page, box, options) {`);
    blocks.push(`  return drawInstructionScene(page, box, ${constant}, options);`);
    blocks.push('}');
    blocks.push('');
  }
  blocks.push('export const STORE_DRAWINGS = {');
  for (const drawing of drawings) blocks.push(`  '${drawing.key}': ${drawing.functionName},`);
  blocks.push('};');
  blocks.push('');
  blocks.push('export const STORE_DRAWING_SCENES = {');
  for (const drawing of drawings) {
    const constant = drawing.functionName
      .replace(/^draw/, '')
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .toUpperCase();
    blocks.push(`  '${drawing.key}': ${constant},`);
  }
  blocks.push('};');
  blocks.push('');
  return blocks.join('\n');
}

export function generateStoreDrawings(input = DEFAULT_INPUT) {
  const files = readdirSync(input)
    .filter((filename) => filename.endsWith('.svg'))
    .sort();
  if (files.length === 0) throw new Error(`${input}: no SVG drawings found`);
  return files.map((filename) => convertSvg(readFileSync(join(input, filename), 'utf8'), filename));
}

async function main() {
  const { values } = parseArgs({
    options: {
      input: { type: 'string', default: DEFAULT_INPUT },
      output: { type: 'string', default: DEFAULT_OUTPUT },
      check: { type: 'boolean', default: false },
    },
  });
  const drawings = generateStoreDrawings(resolve(values.input));
  const moduleSource = generateModule(drawings);
  const output = resolve(values.output);
  if (values.check) {
    if (readFileSync(output, 'utf8') !== moduleSource) {
      throw new Error(`${relative(ROOT, output)} is stale; run npm run gen:store-drawings`);
    }
  } else {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(output, moduleSource);
  }
  for (const drawing of drawings) {
    const sizes = Object.fromEntries(STROKE_WIDTHS.map((_, index) => [index + 1, 0]));
    for (const stroke of drawing.strokes) sizes[stroke.size]++;
    console.log(
      `${drawing.key}: ${drawing.strokes.length} strokes, sizes ${JSON.stringify(sizes)}`
    );
  }
}

if (isMain(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

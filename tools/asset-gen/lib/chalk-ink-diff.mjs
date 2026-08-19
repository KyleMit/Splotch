// Regional reverse-keep for chalk generation. The open-background gate already
// rejects invented sky marks; this scorer partitions the remaining foreground
// with the pen and catches two blind spots independently: chalk ink added inside
// a pen-bounded region, and chalk ink copied through an eroded solid-pen core.
// A shipped chalk may supply per-region allowances so deliberate whites remain
// reproducible instead of forcing every page into one global white budget.
import sharp from 'sharp';
import { dilateMask, erodeMask } from './morphology.mjs';
import { prepareOutlineAnalysis } from './outline-analysis.mjs';
import { OUTLINE_INK_CUTOFF, OUTLINE_MASK_SIZE } from './outline-match.mjs';
import { floodFromBorder } from './regions.mjs';

const PEN_SLACK_PX = 2;
const BACKGROUND_SLACK_PX = 4;
const SOLID_CORE_ERODE_PX = 3;
export const CHALK_INK_BASELINE_GROWTH_FRACTION = 0.1;
export const CHALK_INK_BASELINE_NOISE_PX = 8;

export const CHALK_INK_DIFF_MAX_DEFAULT = 360;

const preparedAnalyses = new WeakSet();
const preparationPromises = new WeakMap();

async function resizeInkMask(source) {
  const analysis = await prepareOutlineAnalysis(source);
  const { data, info } = await sharp(analysis.luma, {
    raw: { width: analysis.w, height: analysis.h, channels: 1 },
  })
    .resize(OUTLINE_MASK_SIZE, OUTLINE_MASK_SIZE, { fit: 'fill' })
    .toColourspace('b-w')
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 1) throw new Error(`chalk ink mask decoded with ${info.channels} channels`);
  const ink = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) if (data[i] < OUTLINE_INK_CUTOFF) ink[i] = 1;
  return ink;
}

function labelMask(mask) {
  const labels = new Int32Array(mask.length).fill(-1);
  const regions = [];
  const stack = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start] !== -1) continue;
    const id = regions.length;
    const region = {
      id,
      area: 0,
      minX: OUTLINE_MASK_SIZE,
      minY: OUTLINE_MASK_SIZE,
      maxX: 0,
      maxY: 0,
    };
    let sp = 0;
    stack[sp++] = start;
    labels[start] = id;
    while (sp) {
      const pixel = stack[--sp];
      region.area++;
      const x = pixel % OUTLINE_MASK_SIZE;
      const y = (pixel / OUTLINE_MASK_SIZE) | 0;
      region.minX = Math.min(region.minX, x);
      region.minY = Math.min(region.minY, y);
      region.maxX = Math.max(region.maxX, x);
      region.maxY = Math.max(region.maxY, y);
      const push = (next) => {
        if (mask[next] && labels[next] === -1) {
          labels[next] = id;
          stack[sp++] = next;
        }
      };
      if (x > 0) push(pixel - 1);
      if (x + 1 < OUTLINE_MASK_SIZE) push(pixel + 1);
      if (y > 0) push(pixel - OUTLINE_MASK_SIZE);
      if (y + 1 < OUTLINE_MASK_SIZE) push(pixel + OUTLINE_MASK_SIZE);
    }
    regions.push(region);
  }
  return { labels, regions };
}

async function prepare(source) {
  const pen = await resizeInkMask(source);
  const background = floodFromBorder(OUTLINE_MASK_SIZE, OUTLINE_MASK_SIZE, (pixel) => !pen[pixel]);
  const bounded = new Uint8Array(pen.length);
  for (let i = 0; i < bounded.length; i++) if (!pen[i] && !background[i]) bounded[i] = 1;
  const solidCore = erodeMask(pen, OUTLINE_MASK_SIZE, OUTLINE_MASK_SIZE, SOLID_CORE_ERODE_PX);
  const boundedRegions = labelMask(bounded);
  const solidRegions = labelMask(solidCore);
  const result = {
    pen,
    background,
    allowed: dilateMask(pen, OUTLINE_MASK_SIZE, OUTLINE_MASK_SIZE, PEN_SLACK_PX),
    backgroundSafe: dilateMask(pen, OUTLINE_MASK_SIZE, OUTLINE_MASK_SIZE, BACKGROUND_SLACK_PX),
    boundedLabels: boundedRegions.labels,
    boundedRegions: boundedRegions.regions,
    solidLabels: solidRegions.labels,
    solidRegions: solidRegions.regions,
  };
  preparedAnalyses.add(result);
  return result;
}

export async function prepareChalkInkDiff(source) {
  if (preparedAnalyses.has(source)) return source;
  const existing = preparationPromises.get(source);
  if (existing) return existing;
  const pending = prepare(source);
  preparationPromises.set(source, pending);
  try {
    return await pending;
  } catch (error) {
    preparationPromises.delete(source);
    throw error;
  }
}

function regionAllowance(baselineInkPx, absoluteMaxInkPx, hasExplicitMax) {
  if (baselineInkPx === undefined) return absoluteMaxInkPx;
  const margin = Math.max(
    CHALK_INK_BASELINE_NOISE_PX,
    Math.ceil(baselineInkPx * CHALK_INK_BASELINE_GROWTH_FRACTION)
  );
  const baselineMaxInkPx = baselineInkPx + margin;
  return hasExplicitMax ? Math.min(absoluteMaxInkPx, baselineMaxInkPx) : baselineMaxInkPx;
}

function regionDiagnostic(region, inkPx, allowedPx, kind) {
  return {
    kind,
    id: region.id,
    inkPx,
    allowedPx,
    area: region.area,
    bbox: [region.minX, region.minY, region.maxX, region.maxY],
  };
}

export async function scoreChalkInkDiff(candidate, source, { baseline = null, maxInkPx } = {}) {
  const hasExplicitMax = maxInkPx !== undefined;
  const absoluteMaxInkPx = maxInkPx ?? CHALK_INK_DIFF_MAX_DEFAULT;
  const analysis = await prepareChalkInkDiff(source);
  const chalk = await resizeInkMask(candidate);
  const boundedInk = new Int32Array(analysis.boundedRegions.length);
  const solidInk = new Int32Array(analysis.solidRegions.length);
  let penMass = 0;
  let invented = 0;
  let whitened = 0;

  for (let i = 0; i < chalk.length; i++) {
    if (analysis.pen[i]) penMass++;
    if (chalk[i]) {
      const solidId = analysis.solidLabels[i];
      if (solidId !== -1) solidInk[solidId]++;
    }
    if (!chalk[i] || analysis.allowed[i]) continue;
    if (analysis.background[i]) {
      if (!analysis.backgroundSafe[i]) invented++;
      continue;
    }
    whitened++;
    const boundedId = analysis.boundedLabels[i];
    if (boundedId !== -1) boundedInk[boundedId]++;
  }

  const flaggedRegions = [];
  const absoluteFlaggedRegions = [];
  for (const region of analysis.boundedRegions) {
    const inkPx = boundedInk[region.id];
    const allowedPx = regionAllowance(
      baseline?.boundedInk?.[region.id],
      absoluteMaxInkPx,
      hasExplicitMax
    );
    if (inkPx > allowedPx)
      flaggedRegions.push(regionDiagnostic(region, inkPx, allowedPx, 'bounded'));
    if (inkPx > absoluteMaxInkPx)
      absoluteFlaggedRegions.push(regionDiagnostic(region, inkPx, absoluteMaxInkPx, 'bounded'));
  }
  for (const region of analysis.solidRegions) {
    const inkPx = solidInk[region.id];
    const allowedPx = regionAllowance(
      baseline?.solidInk?.[region.id],
      absoluteMaxInkPx,
      hasExplicitMax
    );
    if (inkPx > allowedPx) flaggedRegions.push(regionDiagnostic(region, inkPx, allowedPx, 'solid'));
    if (inkPx > absoluteMaxInkPx)
      absoluteFlaggedRegions.push(regionDiagnostic(region, inkPx, absoluteMaxInkPx, 'solid'));
  }

  return {
    passes: flaggedRegions.length === 0,
    absolutePasses: absoluteFlaggedRegions.length === 0,
    inventedRatio: penMass ? invented / penMass : 0,
    whiteFrac: whitened / chalk.length,
    addedInkPx: boundedInk.length ? Math.max(...boundedInk) : 0,
    solidInkPx: solidInk.length ? Math.max(...solidInk) : 0,
    flaggedRegions,
    absoluteFlaggedRegions,
    boundedInk: [...boundedInk],
    solidInk: [...solidInk],
  };
}

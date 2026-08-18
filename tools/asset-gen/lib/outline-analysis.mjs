import sharp from 'sharp';
import { luma } from './image-stats.mjs';
import { OUTLINE_LUMA_THRESHOLD } from './punch-fill.mjs';

const outlineAnalysisPromises = new WeakMap();
const preparedOutlineAnalyses = new WeakSet();

async function decodeOutline(sourceBuf) {
  const { data, info } = await sharp(sourceBuf)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels } = info;
  // chalk-ink-diff.mjs thresholds analysis.luma with OUTLINE_INK_CUTOFF calibrated
  // against libvips greyscale weighting. Unifying this conversion with image-stats
  // luma requires rebuilding the chalk-ink-diff fixtures and re-freezing the
  // coloring golden scores.
  const lumas =
    channels === 1
      ? data
      : (
          await sharp(data, { raw: { width: w, height: h, channels } })
            .greyscale()
            .raw()
            .toBuffer({ resolveWithObject: true })
        ).data;
  const ink = new Uint8Array(w * h);
  for (let p = 0, i = 0; p < ink.length; p++, i += channels) {
    const inkLuma = channels >= 3 ? luma(data[i], data[i + 1], data[i + 2]) : data[i];
    if (inkLuma < OUTLINE_LUMA_THRESHOLD) ink[p] = 1;
  }
  const analysis = { luma: lumas, ink, w, h };
  preparedOutlineAnalyses.add(analysis);
  return analysis;
}

export async function prepareOutlineAnalysis(source) {
  if (preparedOutlineAnalyses.has(source)) return source;
  const existing = outlineAnalysisPromises.get(source);
  if (existing) return existing;
  const pending = decodeOutline(source);
  outlineAnalysisPromises.set(source, pending);
  try {
    return await pending;
  } catch (error) {
    outlineAnalysisPromises.delete(source);
    throw error;
  }
}

function labelRegions(ink, w, h) {
  const label = new Int32Array(w * h).fill(-1);
  const regions = [];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (ink[start] || label[start] !== -1) continue;
    const id = regions.length;
    const reg = { id, area: 0, minX: w, minY: h, maxX: 0, maxY: 0, leftmost: start, border: false };
    let sp = 0;
    stack[sp++] = start;
    label[start] = id;
    while (sp) {
      const p = stack[--sp];
      reg.area++;
      const x = p % w;
      const y = (p / w) | 0;
      if (x < reg.minX) reg.minX = x;
      if (x > reg.maxX) reg.maxX = x;
      if (y < reg.minY) reg.minY = y;
      if (y > reg.maxY) reg.maxY = y;
      const leftmostX = reg.leftmost % w;
      if (x < leftmostX || (x === leftmostX && y < ((reg.leftmost / w) | 0))) reg.leftmost = p;
      if (x === 0 || x === w - 1 || y === 0 || y === h - 1) reg.border = true;
      const tryPush = (q) => {
        if (!ink[q] && label[q] === -1) {
          label[q] = id;
          stack[sp++] = q;
        }
      };
      if (x > 0) tryPush(p - 1);
      if (x < w - 1) tryPush(p + 1);
      if (y > 0) tryPush(p - w);
      if (y < h - 1) tryPush(p + w);
    }
    regions.push(reg);
  }
  return { label, regions };
}

export function prepareOutlineRegions(analysis) {
  if (analysis.regions) return analysis;
  const { label, regions } = labelRegions(analysis.ink, analysis.w, analysis.h);
  analysis.label = label;
  analysis.regions = regions;
  analysis.parents = new Int32Array(regions.length).fill(-2);
  return analysis;
}

import { prepareOutlineAnalysis } from './outline-analysis.mjs';

// Partial or occluded page frames remain four-sided; this bar catches them while
// leaving a wide margin above disconnected edge-near subject marks.
export const FRAME_SIDE_COVERAGE_MIN = 0.7;

// Erasing a frame's ink core leaves its anti-aliased fringe behind as a
// near-white line the ink scan cannot see (the shipped monster-wide ghost sat
// at luma 193–240); anything at or below this bar is visibly non-white paper.
export const GHOST_LUMA_MAX = 245;
// A ghost line is machine-straight and page-spanning, so one side failing is
// enough — but at a higher bar than the four-sided ink check, since hand-drawn
// subject strokes wobble out of the narrow band well below this.
export const GHOST_SIDE_COVERAGE_MIN = 0.9;

// Lossy WebP softens black line edges above the outline-match scorer's stricter ink floor.
const INK_LUMA_MAX = 180;
// Page frames live in the margin; a deeper rectangle is ordinary subject geometry.
const MAX_INSET_FRACTION = 0.125;
// Sampling the central span admits the maximum inset while excluding unrelated corner art.
const SIDE_SAMPLE_FRACTION = 0.75;
// A narrow cross-axis band follows hand-drawn wobble without joining separate nearby marks.
const BAND_HALF_WIDTH_FRACTION = 0.003;

function centralRange(length) {
  const margin = Math.floor((length * (1 - SIDE_SAMPLE_FRACTION)) / 2);
  return { start: margin, end: length - margin };
}

function horizontalCoverage(data, width, height, y) {
  const { start, end } = centralRange(width);
  const halfWidth = Math.max(1, Math.round(height * BAND_HALF_WIDTH_FRACTION));
  const y0 = Math.max(0, y - halfWidth);
  const y1 = Math.min(height - 1, y + halfWidth);
  let covered = 0;
  for (let x = start; x < end; x++) {
    let ink = false;
    for (let sy = y0; sy <= y1 && !ink; sy++) ink = data[sy * width + x] <= INK_LUMA_MAX;
    if (ink) covered++;
  }
  return covered / (end - start);
}

function verticalCoverage(data, width, height, x) {
  const { start, end } = centralRange(height);
  const halfWidth = Math.max(1, Math.round(width * BAND_HALF_WIDTH_FRACTION));
  const x0 = Math.max(0, x - halfWidth);
  const x1 = Math.min(width - 1, x + halfWidth);
  let covered = 0;
  for (let y = start; y < end; y++) {
    let ink = false;
    for (let sx = x0; sx <= x1 && !ink; sx++) ink = data[y * width + sx] <= INK_LUMA_MAX;
    if (ink) covered++;
  }
  return covered / (end - start);
}

// An anti-aliased fringe hugs its stroke within a couple of pixels, so ink this
// close to a gray run claims it as a live soft edge rather than a ghost.
const FRINGE_INK_PAD_PX = 3;

// Gray accompanied by nearby ink is a live stroke's own soft edge; gray alone
// is the orphaned fringe of an erased line — the ghost class.
function horizontalGhostCoverage(data, width, height, y) {
  const { start, end } = centralRange(width);
  const halfWidth = Math.max(1, Math.round(height * BAND_HALF_WIDTH_FRACTION));
  const y0 = Math.max(0, y - halfWidth);
  const y1 = Math.min(height - 1, y + halfWidth);
  const inkY0 = Math.max(0, y0 - FRINGE_INK_PAD_PX);
  const inkY1 = Math.min(height - 1, y1 + FRINGE_INK_PAD_PX);
  let covered = 0;
  for (let x = start; x < end; x++) {
    let ink = false;
    for (let sy = inkY0; sy <= inkY1 && !ink; sy++) ink = data[sy * width + x] <= INK_LUMA_MAX;
    if (ink) continue;
    for (let sy = y0; sy <= y1; sy++) {
      if (data[sy * width + x] <= GHOST_LUMA_MAX) {
        covered++;
        break;
      }
    }
  }
  return covered / (end - start);
}

function verticalGhostCoverage(data, width, height, x) {
  const { start, end } = centralRange(height);
  const halfWidth = Math.max(1, Math.round(width * BAND_HALF_WIDTH_FRACTION));
  const x0 = Math.max(0, x - halfWidth);
  const x1 = Math.min(width - 1, x + halfWidth);
  const inkX0 = Math.max(0, x0 - FRINGE_INK_PAD_PX);
  const inkX1 = Math.min(width - 1, x1 + FRINGE_INK_PAD_PX);
  let covered = 0;
  for (let y = start; y < end; y++) {
    let ink = false;
    for (let sx = inkX0; sx <= inkX1 && !ink; sx++) ink = data[y * width + sx] <= INK_LUMA_MAX;
    if (ink) continue;
    for (let sx = x0; sx <= x1; sx++) {
      if (data[y * width + sx] <= GHOST_LUMA_MAX) {
        covered++;
        break;
      }
    }
  }
  return covered / (end - start);
}

function bestEdgeCoverage(length, coverageAt, fromFarEdge) {
  const maxInset = Math.floor(length * MAX_INSET_FRACTION);
  let bestCoverage = 0;
  for (let inset = 0; inset <= maxInset; inset++) {
    const position = fromFarEdge ? length - 1 - inset : inset;
    const coverage = coverageAt(position);
    if (coverage > bestCoverage) bestCoverage = coverage;
  }
  return bestCoverage;
}

export async function scoreOutlineFrame(source) {
  const { luma: data, w: width, h: height } = await prepareOutlineAnalysis(source);
  const top = bestEdgeCoverage(height, (y) => horizontalCoverage(data, width, height, y), false);
  const bottom = bestEdgeCoverage(height, (y) => horizontalCoverage(data, width, height, y), true);
  const left = bestEdgeCoverage(width, (x) => verticalCoverage(data, width, height, x), false);
  const right = bestEdgeCoverage(width, (x) => verticalCoverage(data, width, height, x), true);
  const sides = { top, right, bottom, left };
  const sideCoverage = Math.min(...Object.values(sides));
  const ghostSides = {
    top: bestEdgeCoverage(height, (y) => horizontalGhostCoverage(data, width, height, y), false),
    bottom: bestEdgeCoverage(height, (y) => horizontalGhostCoverage(data, width, height, y), true),
    left: bestEdgeCoverage(width, (x) => verticalGhostCoverage(data, width, height, x), false),
    right: bestEdgeCoverage(width, (x) => verticalGhostCoverage(data, width, height, x), true),
  };
  const ghostCoverage = Math.max(...Object.values(ghostSides));
  return {
    sides,
    sideCoverage,
    ghostSides,
    ghostCoverage,
    passes: sideCoverage < FRAME_SIDE_COVERAGE_MIN && ghostCoverage < GHOST_SIDE_COVERAGE_MIN,
  };
}

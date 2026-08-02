import sharp from 'sharp';

// A page enclosure is continuous; the small gap allowance absorbs WebP antialias noise.
export const FRAME_SIDE_COVERAGE_MIN = 0.97;

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

function bestEdgeCoverage(length, coverageAt, fromFarEdge) {
  const maxInset = Math.floor(length * MAX_INSET_FRACTION);
  let best = { position: fromFarEdge ? length - 1 : 0, coverage: 0 };
  for (let inset = 0; inset <= maxInset; inset++) {
    const position = fromFarEdge ? length - 1 - inset : inset;
    const coverage = coverageAt(position);
    if (coverage > best.coverage) best = { position, coverage };
  }
  return best;
}

export async function scoreOutlineFrame(outlineBuf) {
  const { data, info } = await sharp(outlineBuf)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const top = bestEdgeCoverage(height, (y) => horizontalCoverage(data, width, height, y), false);
  const bottom = bestEdgeCoverage(height, (y) => horizontalCoverage(data, width, height, y), true);
  const left = bestEdgeCoverage(width, (x) => verticalCoverage(data, width, height, x), false);
  const right = bestEdgeCoverage(width, (x) => verticalCoverage(data, width, height, x), true);
  const sides = { top, right, bottom, left };
  const sideCoverage = Math.min(...Object.values(sides).map((side) => side.coverage));
  return {
    sides,
    sideCoverage,
    frameDetected: sideCoverage >= FRAME_SIDE_COVERAGE_MIN,
    passes: sideCoverage < FRAME_SIDE_COVERAGE_MIN,
  };
}

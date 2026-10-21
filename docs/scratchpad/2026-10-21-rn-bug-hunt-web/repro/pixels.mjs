import sharp from 'sharp';

const RASTER_FRINGE_PX = 1;
const AA_SHADE_SLOP = 10;
const EQUAL_CHANNEL_SLOP = 2;

export async function paperDifference(expected, actual) {
  const a = await sharp(expected).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(actual).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (a.info.width !== b.info.width || a.info.height !== b.info.height)
    throw new Error('Paper crop dimensions changed');
  const { width, height } = a.info;
  let changedPixels = 0,
    violations = 0,
    total = 0,
    max = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 3;
      let changed = false,
        close = true;
      for (let c = 0; c < 3; c++) {
        const diff = Math.abs(a.data[offset + c] - b.data[offset + c]);
        total += diff;
        max = Math.max(max, diff);
        changed ||= diff > 0;
        close &&= diff <= EQUAL_CHANNEL_SLOP;
      }
      if (changed) changedPixels++;
      if (close) continue;
      let outside = false;
      for (let c = 0; c < 3; c++) {
        let amin = 255,
          amax = 0,
          bmin = 255,
          bmax = 0;
        for (
          let yy = Math.max(0, y - RASTER_FRINGE_PX);
          yy <= Math.min(height - 1, y + RASTER_FRINGE_PX);
          yy++
        )
          for (
            let xx = Math.max(0, x - RASTER_FRINGE_PX);
            xx <= Math.min(width - 1, x + RASTER_FRINGE_PX);
            xx++
          ) {
            const p = (yy * width + xx) * 3 + c;
            amin = Math.min(amin, a.data[p]);
            amax = Math.max(amax, a.data[p]);
            bmin = Math.min(bmin, b.data[p]);
            bmax = Math.max(bmax, b.data[p]);
          }
        outside ||=
          a.data[offset + c] < bmin - AA_SHADE_SLOP ||
          a.data[offset + c] > bmax + AA_SHADE_SLOP ||
          b.data[offset + c] < amin - AA_SHADE_SLOP ||
          b.data[offset + c] > amax + AA_SHADE_SLOP;
      }
      if (outside) violations++;
    }
  return {
    width,
    height,
    changedPixels,
    mean: total / a.data.length,
    max,
    fringeViolations: violations,
    rasterFringePx: RASTER_FRINGE_PX,
    aaShadeSlop: AA_SHADE_SLOP,
    limits:
      'Diagnostic one-pixel antialias envelope; not pixel-exact token or final parity acceptance.',
  };
}

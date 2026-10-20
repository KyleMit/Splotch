// Finds the drawing paper's extent in a settled blank frame by scanning out from the screen centre
// for pixels that match the centre's colour.
import sharp from 'sharp';

const PAPER_COLOR_TOLERANCE = 14;
// A pixel counts as paper when at least 3 of the 5 pixels across the scan line at it match, so a
// single anti-aliased pixel does not end the scan.
const SCAN_WINDOW_RADIUS = 2;
const SCAN_WINDOW_MATCHES = 3;

export async function scanPaperRect(pngPath) {
  const { data, info } = await sharp(pngPath).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const pixel = (x, y) => {
    const i = (y * width + x) * channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const reference = pixel(cx, cy);
  const matches = (p) =>
    p.every((value, k) => Math.abs(value - reference[k]) <= PAPER_COLOR_TOLERANCE);
  const clampX = (x) => Math.min(width - 1, Math.max(0, x));
  const clampY = (y) => Math.min(height - 1, Math.max(0, y));
  const isPaper = (x, y, vertical) => {
    let hits = 0;
    for (let d = -SCAN_WINDOW_RADIUS; d <= SCAN_WINDOW_RADIUS; d += 1) {
      if (matches(vertical ? pixel(x, clampY(y + d)) : pixel(clampX(x + d), y))) hits += 1;
    }
    return hits >= SCAN_WINDOW_MATCHES;
  };
  let top = cy;
  while (top > 0 && isPaper(cx, top - 1, true)) top -= 1;
  let bottom = cy;
  while (bottom < height - 1 && isPaper(cx, bottom + 1, true)) bottom += 1;
  let left = cx;
  while (left > 0 && isPaper(left - 1, cy, false)) left -= 1;
  let right = cx;
  while (right < width - 1 && isPaper(right + 1, cy, false)) right += 1;
  return {
    px: { x: left, y: top, w: right - left + 1, h: bottom - top + 1 },
    paperColor: reference,
    imageSize: [width, height],
  };
}

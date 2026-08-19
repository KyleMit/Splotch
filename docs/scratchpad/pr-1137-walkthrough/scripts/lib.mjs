import sharp from 'sharp';

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function raw(input) {
  return sharp(input).greyscale().raw().toBuffer({ resolveWithObject: true });
}

export async function encodeQ(input, quality) {
  return sharp(input).webp({ quality }).toBuffer();
}

// Fraction of pixels that are neither near-black nor near-white: for binary ink art
// this is antialiasing + compression ringing.
export async function midtoneFraction(input) {
  const { data } = await raw(input);
  let mid = 0;
  for (const v of data) if (v > 8 && v < 248) mid++;
  return mid / data.length;
}

export async function zoomCrop(input, { left, top, w, h, factor }) {
  return sharp(input)
    .extract({ left, top, width: w, height: h })
    .resize({ width: w * factor, height: h * factor, kernel: 'nearest' })
    .png()
    .toBuffer();
}

// Absolute difference, amplified so sub-perceptual compression error becomes visible.
export async function ampDiff(a, b, gain, size) {
  const [ra, rb] = await Promise.all([raw(a), raw(b)]);
  const out = Buffer.alloc(ra.data.length);
  for (let i = 0; i < out.length; i++) {
    out[i] = 255 - Math.min(255, Math.abs(ra.data[i] - rb.data[i]) * gain);
  }
  let img = sharp(out, { raw: { width: ra.info.width, height: ra.info.height, channels: 1 } });
  if (size) img = img.resize(size, size, { fit: 'inside', kernel: 'nearest' });
  return img.png().toBuffer();
}

export function svgLabel(width, height, lines, opts = {}) {
  const { bg = '#ffffff', fg = '#111827', size = 20, weight = 600, align = 'middle' } = opts;
  const x = align === 'start' ? 12 : width / 2;
  const lh = size * 1.35;
  const startY = height / 2 - ((lines.length - 1) * lh) / 2 + size * 0.35;
  const text = lines
    .map((l, i) => {
      const t = typeof l === 'string' ? { t: l } : l;
      return `<text x="${x}" y="${startY + i * lh}" text-anchor="${align === 'start' ? 'start' : 'middle'}" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" font-size="${t.size || size}" font-weight="${t.weight || weight}" fill="${t.fg || fg}">${esc(t.t)}</text>`;
    })
    .join('');
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${bg}"/>${text}</svg>`
  );
}

export async function stack(items, { gap = 0, bg = '#ffffff', dir = 'v' } = {}) {
  const metas = await Promise.all(items.map((b) => sharp(b).metadata()));
  const w = dir === 'v'
    ? Math.max(...metas.map((m) => m.width))
    : metas.reduce((a, m) => a + m.width, 0) + gap * (items.length - 1);
  const h = dir === 'v'
    ? metas.reduce((a, m) => a + m.height, 0) + gap * (items.length - 1)
    : Math.max(...metas.map((m) => m.height));
  let cursor = 0;
  const comps = items.map((b, i) => {
    const c = {
      input: b,
      left: dir === 'v' ? Math.round((w - metas[i].width) / 2) : cursor,
      top: dir === 'v' ? cursor : Math.round((h - metas[i].height) / 2),
    };
    cursor += (dir === 'v' ? metas[i].height : metas[i].width) + gap;
    return c;
  });
  return sharp({ create: { width: w, height: h, channels: 3, background: bg } })
    .composite(comps)
    .png()
    .toBuffer();
}

// Locate the densest ink region so crops land on real strokes, not empty paper.
export async function findEdgyCrop(file, win) {
  const { data, info } = await raw(file);
  const step = Math.max(16, Math.floor(win / 4));
  let best = { score: -1, left: 0, top: 0 };
  for (let top = 0; top + win <= info.height; top += step) {
    for (let left = 0; left + win <= info.width; left += step) {
      let edges = 0;
      for (let y = top; y < top + win; y += 3) {
        const row = y * info.width;
        for (let x = left; x < left + win - 1; x += 3) {
          if (Math.abs(data[row + x] - data[row + x + 1]) > 90) edges++;
        }
      }
      if (edges > best.score) best = { score: edges, left, top };
    }
  }
  return { ...best, w: win, h: win };
}

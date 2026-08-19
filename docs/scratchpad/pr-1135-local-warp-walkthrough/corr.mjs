import sharp from 'sharp';
import * as v from './warpviz.mjs';

const TILE = 128, STRIDE = 64, R = 12, EDGE_MIN = 60, MAX_EDGES = 2000;

function gradients(g, width, height) {
  const mag = new Float32Array(width * height);
  const gx = new Int16Array(width * height), gy = new Int16Array(width * height);
  for (let y = 0; y < height - 1; y++)
    for (let x = 0; x < width - 1; x++) {
      const i = y * width + x;
      gx[i] = g[i + 1] - g[i]; gy[i] = g[i + width] - g[i];
      mag[i] = Math.abs(gx[i]) + Math.abs(gy[i]);
    }
  return { mag, gx, gy };
}

function blur3(values, width, height) {
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= width) continue;
          s += values[yy * width + xx]; c++;
        }
      }
      out[y * width + x] = s / c;
    }
  return out;
}

export async function surface(sourceBuf, fillBuf, tileX, tileY, radius = R) {
  const sg = await v.gray(sourceBuf), fg = await v.gray(fillBuf);
  const { width, height } = sg;
  const se = gradients(sg.data, width, height);
  const fe = blur3(gradients(fg.data, width, height).mag, width, height);
  const x0 = tileX * STRIDE, x1 = Math.min(width, x0 + TILE);
  const y0 = tileY * STRIDE, y1 = Math.min(height, y0 + TILE);
  const pts = [];
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = y * width + x;
      if (se.mag[i] <= EDGE_MIN) continue;
      pts.push({ x, y, w: se.mag[i] });
    }
  pts.sort((a, b) => b.w - a.w);
  const sel = pts.slice(0, MAX_EDGES);
  const RR = radius;
  const n = 2 * RR + 1;
  const grid = new Float64Array(n * n);
  for (let dy = -RR; dy <= RR; dy++)
    for (let dx = -RR; dx <= RR; dx++) {
      let s = 0;
      for (const p of sel) {
        const x = p.x + dx, y = p.y + dy;
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        s += p.w * fe[y * width + x];
      }
      grid[(dy + RR) * n + (dx + RR)] = s;
    }
  let best = { dx: 0, dy: 0, s: -1 };
  for (let dy = -RR; dy <= RR; dy++)
    for (let dx = -RR; dx <= RR; dx++) {
      const s = grid[(dy + RR) * n + (dx + RR)];
      if (s > best.s) best = { dx, dy, s };
    }
  return { grid, n, R: RR, best, zero: grid[RR * n + RR] };
}

// turbo-ish colormap
function ramp(t) {
  t = Math.max(0, Math.min(1, t));
  const stops = [[13,20,60],[30,90,190],[20,180,170],[190,220,60],[250,170,40],[230,50,40]];
  const f = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(f)), k = f - i;
  return [0,1,2].map((c) => Math.round(stops[i][c] + (stops[i+1][c] - stops[i][c]) * k));
}

export async function renderSurface(sf, size = 380, opts = {}) {
  const { grid, n, R, best } = sf;
  let min = Infinity, max = -Infinity;
  for (const g of grid) { if (g < min) min = g; if (g > max) max = g; }
  const raw = Buffer.alloc(n * n * 3);
  for (let i = 0; i < n * n; i++) {
    const [r, g, b] = ramp((grid[i] - min) / (max - min || 1));
    raw[i * 3] = r; raw[i * 3 + 1] = g; raw[i * 3 + 2] = b;
  }
  const cell = Math.floor(size / n);
  const dim = cell * n;
  const base = await sharp(raw, { raw: { width: n, height: n, channels: 3 } })
    .resize(dim, dim, { kernel: 'nearest' }).png().toBuffer();
  const px = (d) => (d + R) * cell + cell / 2;
  const ring = `<rect x="${cell/2}" y="${cell/2}" width="${dim - cell}" height="${dim - cell}" fill="none" stroke="#ffffff" stroke-dasharray="6 5" stroke-width="2" opacity="0.75"/>`;
  const zero = `<circle cx="${px(0)}" cy="${px(0)}" r="${cell*0.45}" fill="none" stroke="#ffffff" stroke-width="2"/><text x="${px(0)+cell*0.7}" y="${px(0)+6}" font-family="DejaVu Sans, sans-serif" font-size="15" fill="#ffffff">0,0</text>`;
  const peak = `<circle cx="${px(best.dx)}" cy="${px(best.dy)}" r="${cell*0.6}" fill="none" stroke="#ff2d55" stroke-width="3"/><text x="${px(best.dx)+cell*0.8}" y="${px(best.dy)+6}" font-family="DejaVu Sans, sans-serif" font-size="15" fill="#ff2d55" font-weight="bold">${best.dx},${best.dy}</text>`;
  const twice = opts.showTwice ? `<circle cx="${px(Math.max(-R,Math.min(R,best.dx*2)))}" cy="${px(Math.max(-R,Math.min(R,best.dy*2)))}" r="${cell*0.4}" fill="none" stroke="#ffd400" stroke-width="2"/>` : '';
  const svg = Buffer.from(`<svg width="${dim}" height="${dim}">${ring}${zero}${peak}${twice}</svg>`);
  return sharp(await sharp(base).composite([{ input: svg }]).png().toBuffer());
}

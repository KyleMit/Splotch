import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import * as v from './warpviz.mjs';
import * as c from './corr.mjs';

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const BG = '#161616';
const cap = (t, w, h = 30, color = '#bdbdbd', size = 17) =>
  sharp(Buffer.from(`<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${BG}"/><text x="4" y="${h - 9}" font-family="DejaVu Sans, sans-serif" font-size="${size}" fill="${color}">${esc(t)}</text></svg>`)).png();

const rad2col = (r) => {
  const t = (r - 4) / 16;
  const hue = 200 - 200 * t;
  return `hsl(${hue}, 95%, 60%)`;
};

const REL = 'vehicles/excavator-wide', THEME = 'light', TX = 5, TY = 5, CENTER = [384, 384];
const RADII = [4, 6, 8, 10, 12, 14, 16, 18, 20];

const { source, fill } = await v.loadPair(REL, THEME);
const sf = await c.surface(source, fill, TX, TY, 20);
const { grid, n, R } = sf;
const walk = RADII.map((rad) => {
  let best = { dx: 0, dy: 0, s: -1 };
  for (let dy = -rad; dy <= rad; dy++)
    for (let dx = -rad; dx <= rad; dx++) {
      const s = grid[(dy + R) * n + (dx + R)];
      if (s > best.s) best = { dx, dy, s };
    }
  return { rad, ...best, mag: Math.hypot(best.dx, best.dy) };
});

// --- surface panel with per-radius argmax markers
const SIZE = 492;
const cell = Math.floor(SIZE / n);
const dim = cell * n;
let min = Infinity, max = -Infinity;
for (const g of grid) { if (g < min) min = g; if (g > max) max = g; }
const raw = Buffer.alloc(n * n * 3);
const ramp = (t) => {
  t = Math.max(0, Math.min(1, t));
  const stops = [[13,20,60],[30,90,190],[20,180,170],[190,220,60],[250,170,40],[230,50,40]];
  const f = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(f)), k = f - i;
  return [0,1,2].map((q) => Math.round(stops[i][q] + (stops[i+1][q] - stops[i][q]) * k));
};
for (let i = 0; i < n * n; i++) {
  const [r, g, b] = ramp((grid[i] - min) / (max - min || 1));
  raw[i*3] = r; raw[i*3+1] = g; raw[i*3+2] = b;
}
const base = await sharp(raw, { raw: { width: n, height: n, channels: 3 } }).resize(dim, dim, { kernel: 'nearest' }).png().toBuffer();
const px = (d) => (d + R) * cell + cell / 2;
const marks = walk.map((w) =>
  `<circle cx="${px(w.dx)}" cy="${px(w.dy)}" r="${cell*0.55}" fill="none" stroke="${rad2col(w.rad)}" stroke-width="2.5"/>` +
  `<text x="${px(w.dx)+cell*0.9}" y="${px(w.dy)+5}" font-family="DejaVu Sans, sans-serif" font-size="13" fill="${rad2col(w.rad)}">±${w.rad}</text>`
).join('');
const shipped = `<rect x="${px(-12)-cell/2}" y="${px(-12)-cell/2}" width="${25*cell}" height="${25*cell}" fill="none" stroke="#ffffff" stroke-dasharray="7 5" stroke-width="2.5"/>` +
  `<text x="${px(-12)-cell/2+6}" y="${px(-12)-cell/2+20}" font-family="DejaVu Sans, sans-serif" font-size="15" fill="#ffffff">shipped ±12px window</text>`;
const zero = `<circle cx="${px(0)}" cy="${px(0)}" r="${cell*0.4}" fill="#ffffff"/><text x="${px(0)+cell*0.7}" y="${px(0)+5}" font-family="DejaVu Sans, sans-serif" font-size="14" fill="#ffffff">0,0</text>`;
const surfPanel = await v.png(sharp(await sharp(base).composite([{ input: Buffer.from(`<svg width="${dim}" height="${dim}">${shipped}${zero}${marks}</svg>`) }]).png().toBuffer()));

// --- the crop panels
const sg = await v.gray(source), fg = await v.gray(fill);
const sm = v.edgeMag(sg.data, sg.width, sg.height), fm = v.edgeMag(fg.data, fg.width, fg.height);
const CROP = 200, P = 300;
const box = { x0: CENTER[0] - CROP / 2, y0: CENTER[1] - CROP / 2, w: CROP, h: CROP };
const cropOf = (buf) => sharp(buf).extract({ left: box.x0, top: box.y0, width: CROP, height: CROP }).resize(P, P, { kernel: 'nearest' }).removeAlpha().png();
const locScale = 300 / Math.max(sg.width, sg.height);
const locW = Math.round(sg.width * locScale), locH = Math.round(sg.height * locScale);
const locBase = await sharp(fill).resize(locW, locH).removeAlpha().toBuffer();
const loc = await v.png(sharp(await sharp(locBase).composite([{ input: Buffer.from(`<svg width="${locW}" height="${locH}"><rect x="${box.x0*locScale}" y="${box.y0*locScale}" width="${CROP*locScale}" height="${CROP*locScale}" fill="none" stroke="#ff2d55" stroke-width="3"/></svg>`) }]).png().toBuffer()));

const gridCells = await Promise.all([
  v.png(sharp(locBase).png()),
  v.png(cropOf(source)),
  v.png(cropOf(fill)),
  v.png(v.edgeOverlay(sm, fm, sg.width, sg.height, box, 0, 0).resize(P, P, { kernel: 'nearest' })),
]);
const locFramed = loc;
const gridRow1 = await v.rowOf([locFramed, gridCells[1]]);
const gridCap1 = await v.rowOf([await v.png(cap('where on the page', locFramed.width)), await v.png(cap('line art', P))]);
const gridRow2 = await v.rowOf([gridCells[2], gridCells[3]]);
const gridCap2 = await v.rowOf([await v.png(cap('painted fill', P)), await v.png(cap('magenta = line   cyan = paint', P, 30, '#ff9f6b'))]);

// --- walk table
const tblW = 492, rowH = 26;
const tblLines = walk.map((w, i) =>
  `<text x="12" y="${52 + i * rowH}" font-family="DejaVu Sans Mono, monospace" font-size="17" fill="${rad2col(w.rad)}">search ±${String(w.rad).padStart(2)}px  →  argmax ${String(w.dx).padStart(3)},${String(w.dy).padStart(3)}   = ${w.mag.toFixed(2)}px</text>`
).join('');
const tbl = await v.png(sharp(Buffer.from(
  `<svg width="${tblW}" height="${52 + walk.length * rowH + 60}"><rect width="${tblW}" height="${52 + walk.length * rowH + 60}" fill="#1e1e1e"/>` +
  `<text x="12" y="26" font-family="DejaVu Sans, sans-serif" font-size="18" font-weight="bold" fill="#ffffff">measured displacement vs. search window</text>` +
  tblLines +
  `<text x="12" y="${52 + walk.length * rowH + 26}" font-family="DejaVu Sans, sans-serif" font-size="17" fill="#ff6b6b">perfectly linear → the number is the window, not the art</text>` +
  `</svg>`
)).png());

const title = await v.png(sharp(Buffer.from(
  `<svg width="1200" height="76"><rect width="1200" height="76" fill="${BG}"/>` +
  `<text x="4" y="30" font-family="DejaVu Sans, sans-serif" font-size="24" font-weight="bold" fill="#ffffff">The bug the review caught: vehicles/excavator-wide, tile 5,5 @ (384,384)</text>` +
  `<text x="4" y="60" font-family="DejaVu Sans, sans-serif" font-size="19" fill="#c9c9c9">first implementation reported 11.66px here · corrected scorer reports 0px</text></svg>`
)).png());

const left = await v.stackRows([await v.png(cap('correlation surface, \u00b120px (red = strongest match)', 492, 30, '#e0e0e0')), surfPanel, tbl]);
const leftMeta = await sharp(left).metadata();
const rightStack = await v.stackRows([gridCap1, gridRow1, gridCap2, gridRow2]);
const rightMeta = await sharp(rightStack).metadata();
const body = await v.rowOf([
  { buffer: left, width: leftMeta.width, height: leftMeta.height },
  { buffer: rightStack, width: rightMeta.width, height: rightMeta.height },
], 16);
const out = await v.stackRows([title, body]);
await writeFile('out/fig-aperture.png', out);
console.log('ok');

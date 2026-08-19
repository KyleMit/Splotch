import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import * as v from './warpviz.mjs';
import { localWarp } from '../../../tools/asset-gen/lib/local-warp.mjs';

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const BG = '#161616';
const P = 156, CROP = 176;

const PAGES = [
  ['space/meteor-wide', 'night'], ['creatures/fairy-wide', 'light'], ['objects/apple-wide', 'light'],
  ['dinosaur/pterodactyl-wide', 'light'], ['dinosaur/pterodactyl-wide', 'night'], ['dinosaur/stegosaurus-wide', 'light'],
  ['dinosaur/triceratops-wide', 'light'], ['dinosaur/velociraptor-wide', 'light'], ['farm/pig-wide', 'light'],
  ['nature/ant-wide', 'light'], ['space/astronaut-wide', 'night'], ['space/meteor-wide', 'light'],
];

async function cell(rel, theme) {
  const { source, fill } = await v.loadPair(rel, theme);
  const r = await localWarp(source, fill);
  const tile = r.worstTile ?? r.tiles.reduce((a, b) => (a && a.localWarp >= b.localWarp ? a : b), null);
  const sg = await v.gray(source), fg = await v.gray(fill);
  const sm = v.edgeMag(sg.data, sg.width, sg.height), fm = v.edgeMag(fg.data, fg.width, fg.height);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const box = {
    x0: clamp(Math.round(tile.centerX - CROP / 2), 0, sg.width - CROP),
    y0: clamp(Math.round(tile.centerY - CROP / 2), 0, sg.height - CROP), w: CROP, h: CROP,
  };
  const scale = Math.min(P / sg.width, P / sg.height);
  const lw = Math.round(sg.width * scale), lh = Math.round(sg.height * scale);
  const locBase = await sharp(fill).resize(lw, lh).removeAlpha().toBuffer();
  const locMark = await sharp(locBase).composite([{ input: Buffer.from(`<svg width="${lw}" height="${lh}"><rect x="${box.x0*scale}" y="${box.y0*scale}" width="${CROP*scale}" height="${CROP*scale}" fill="none" stroke="#ff2d55" stroke-width="2.5"/></svg>`) }]).png().toBuffer();
  const loc = await v.png(sharp({ create: { width: P, height: P, channels: 3, background: BG } }).composite([{ input: locMark, left: Math.round((P-lw)/2), top: Math.round((P-lh)/2) }]).png());
  const fillCrop = await v.png(sharp(fill).extract({ left: box.x0, top: box.y0, width: CROP, height: CROP }).resize(P, P, { kernel: 'nearest' }).removeAlpha().png());
  const over = await v.png(v.edgeOverlay(sm, fm, sg.width, sg.height, box, 0, 0).resize(P, P, { kernel: 'nearest' }));
  const imgs = await v.rowOf([loc, fillCrop, over], 5);
  const W = imgs.width;
  const capText = `${rel} · ${theme}`;
  const cap = await v.png(sharp(Buffer.from(`<svg width="${W}" height="52"><rect width="${W}" height="52" fill="${BG}"/>` +
    `<text x="3" y="20" font-family="DejaVu Sans, sans-serif" font-size="15" fill="#ffffff">${esc(capText)}</text>` +
    `<text x="3" y="42" font-family="DejaVu Sans, sans-serif" font-size="15" font-weight="bold" fill="${r.localWarpMax >= 3 ? '#ffd400' : '#7ee787'}">warp ${r.localWarpMax.toFixed(2)}px · residual (${r.globalDx},${r.globalDy}) · ${tile.confidence ?? 'no confident tile'}</text></svg>`)).png());
  const stacked = await v.stackRows([cap, { buffer: imgs.buffer, width: imgs.width, height: imgs.height }]);
  const m = await sharp(stacked).metadata();
  console.log(rel, theme, r.localWarpMax.toFixed(2));
  return { buffer: stacked, width: m.width, height: m.height };
}

const cells = [];
for (const [rel, theme] of PAGES) cells.push(await cell(rel, theme));
const rows = [];
for (let i = 0; i < cells.length; i += 3) rows.push(await v.rowOf(cells.slice(i, i + 3), 18));
const width = rows[0].width;
const title = await v.png(sharp(Buffer.from(`<svg width="${width}" height="80"><rect width="${width}" height="80" fill="${BG}"/>` +
  `<text x="4" y="30" font-family="DejaVu Sans, sans-serif" font-size="23" font-weight="bold" fill="#ffffff">The other pages that score above zero — all comfortably under the 4px gate</text>` +
  `<text x="4" y="58" font-family="DejaVu Sans, sans-serif" font-size="17" fill="#c9c9c9">per cell: whole page (red box = scored tile) · that crop painted · edges (magenta = line art, cyan = paint, white = coincident)</text></svg>`)).png());
await writeFile('out/fig-contact.png', await v.stackRows([title, ...rows.map((r) => ({ buffer: r.buffer, width: r.width, height: r.height }))]));
console.log('done');

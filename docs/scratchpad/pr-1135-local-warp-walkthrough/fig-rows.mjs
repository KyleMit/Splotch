import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import * as v from './warpviz.mjs';
import * as c from './corr.mjs';
import { localWarp } from '../../../tools/asset-gen/lib/local-warp.mjs';

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const BG = '#161616';

export async function pageRow(rel, theme, { P = 240, crop = 176, ceiling = null, note = '' } = {}) {
  const { source, fill } = await v.loadPair(rel, theme);
  const r = await localWarp(source, fill);
  const tile = r.worstTile ?? r.tiles.reduce((a, b) => (a && a.localWarp >= b.localWarp ? a : b), null);
  const sg = await v.gray(source), fg = await v.gray(fill);
  const sm = v.edgeMag(sg.data, sg.width, sg.height), fm = v.edgeMag(fg.data, fg.width, fg.height);
  const box = { x0: Math.round(tile.centerX - crop / 2), y0: Math.round(tile.centerY - crop / 2), w: crop, h: crop };
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  box.x0 = clamp(box.x0, 0, sg.width - crop); box.y0 = clamp(box.y0, 0, sg.height - crop);

  const scale = Math.min(P / sg.width, P / sg.height);
  const lw = Math.round(sg.width * scale), lh = Math.round(sg.height * scale);
  const locBase = await sharp(fill).resize(lw, lh).removeAlpha().toBuffer();
  const locMark = await sharp(locBase).composite([{ input: Buffer.from(`<svg width="${lw}" height="${lh}"><rect x="${box.x0*scale}" y="${box.y0*scale}" width="${crop*scale}" height="${crop*scale}" fill="none" stroke="#ff2d55" stroke-width="3"/></svg>`) }]).png().toBuffer();
  const loc = await v.png(sharp({ create: { width: P, height: P, channels: 3, background: BG } }).composite([{ input: locMark, left: Math.round((P-lw)/2), top: Math.round((P-lh)/2) }]).png());

  const cropOf = (buf) => sharp(buf).extract({ left: box.x0, top: box.y0, width: crop, height: crop }).resize(P, P, { kernel: 'nearest' }).removeAlpha().png();
  const sf = await c.surface(source, fill, tile.x, tile.y, 12);
  const surf = await c.renderSurface(sf, P);

  const over4 = r.localWarpMax > 4;
  const lines = [
    { t: `${rel} · ${theme}`, s: 19, b: true, c: '#ffffff' },
    { t: `local warp  ${r.localWarpMax.toFixed(2)} px`, s: 20, b: true, c: over4 ? '#ff9f6b' : '#7ee787' },
    { t: `residual global shift  (${r.globalDx}, ${r.globalDy})`, s: 16, c: '#cfcfcf' },
    { t: `worst tile ${tile.x},${tile.y} @ (${tile.centerX},${tile.centerY})  offset ${tile.dx},${tile.dy}`, s: 16, c: '#cfcfcf' },
    { t: `${tile.confidence ?? 'rejected'} · gain ${tile.gain.toFixed(2)} · peak ${tile.peak.toFixed(2)}`, s: 16, c: '#cfcfcf' },
    { t: `falloff ${tile.falloff.toFixed(2)} · dispersion ${tile.orientationDispersion.toFixed(2)} · boundary ${tile.boundaryPeak}`, s: 16, c: '#cfcfcf' },
    ceiling !== null
      ? { t: `notes.json ceiling ${ceiling}px → passes`, s: 17, b: true, c: '#ffd400' }
      : { t: `default 4px gate → ${over4 ? 'FAIL' : 'pass'}`, s: 17, b: true, c: over4 ? '#ff6b6b' : '#7ee787' },
  ];
  if (note) lines.push({ t: note, s: 15, c: '#a8a8a8' });
  const SW = 400;
  const stats = await v.png(sharp(Buffer.from(`<svg width="${SW}" height="${P}"><rect width="${SW}" height="${P}" fill="#1e1e1e"/>` +
    lines.map((l, i) => `<text x="12" y="${26 + i * 29}" font-family="DejaVu Sans, sans-serif" font-size="${l.s}" ${l.b ? 'font-weight="bold"' : ''} fill="${l.c}">${esc(l.t)}</text>`).join('') + `</svg>`)).png());

  const row = await v.rowOf([loc, await v.png(cropOf(source)), await v.png(cropOf(fill)),
    await v.png(v.edgeOverlay(sm, fm, sg.width, sg.height, box, 0, 0).resize(P, P, { kernel: 'nearest' })),
    await v.png(surf), stats], 8);
  return { row, r, tile };
}

export function headerRow(width, labels, P, gap = 8, SW = 400) {
  const parts = [];
  let x = 0;
  for (let i = 0; i < labels.length; i++) {
    const w = i === labels.length - 1 ? SW : P;
    parts.push(`<text x="${x + 4}" y="21" font-family="DejaVu Sans, sans-serif" font-size="15" fill="#bdbdbd">${esc(labels[i])}</text>`);
    x += w + gap;
  }
  return sharp(Buffer.from(`<svg width="${width}" height="28"><rect width="${width}" height="28" fill="${BG}"/>${parts.join('')}</svg>`)).png();
}

export function titleBar(width, title, sub) {
  return sharp(Buffer.from(`<svg width="${width}" height="76"><rect width="${width}" height="76" fill="${BG}"/><text x="4" y="30" font-family="DejaVu Sans, sans-serif" font-size="24" font-weight="bold" fill="#ffffff">${esc(title)}</text><text x="4" y="60" font-family="DejaVu Sans, sans-serif" font-size="18" fill="#c9c9c9">${esc(sub)}</text></svg>`)).png();
}

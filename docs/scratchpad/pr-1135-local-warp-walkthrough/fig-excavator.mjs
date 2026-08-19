import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import * as v from './warpviz.mjs';
import * as c from './corr.mjs';
import * as v1 from './local-warp-v1.mjs';
import * as v2 from '../../../tools/asset-gen/lib/local-warp.mjs';

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const BG = '#161616';
const P = 250, CROP = 200;

async function row(rel, theme) {
  const { source, fill } = await v.loadPair(rel, theme);
  const [a, b] = [await v1.localWarp(source, fill), await v2.localWarp(source, fill)];
  const old = a.worstTile;
  const now = b.tiles.find((t) => t.x === old.x && t.y === old.y);
  const sg = await v.gray(source), fg = await v.gray(fill);
  const sm = v.edgeMag(sg.data, sg.width, sg.height), fm = v.edgeMag(fg.data, fg.width, fg.height);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const box = { x0: clamp(Math.round(old.centerX - CROP/2), 0, sg.width-CROP), y0: clamp(Math.round(old.centerY - CROP/2), 0, sg.height-CROP), w: CROP, h: CROP };
  const scale = Math.min(P / sg.width, P / sg.height);
  const lw = Math.round(sg.width*scale), lh = Math.round(sg.height*scale);
  const locBase = await sharp(fill).resize(lw, lh).removeAlpha().toBuffer();
  const locMark = await sharp(locBase).composite([{ input: Buffer.from(`<svg width="${lw}" height="${lh}"><rect x="${box.x0*scale}" y="${box.y0*scale}" width="${CROP*scale}" height="${CROP*scale}" fill="none" stroke="#ff2d55" stroke-width="3"/></svg>`) }]).png().toBuffer();
  const loc = await v.png(sharp({ create: { width: P, height: P, channels: 3, background: BG } }).composite([{ input: locMark, left: Math.round((P-lw)/2), top: Math.round((P-lh)/2) }]).png());
  const sf = await c.surface(source, fill, old.x, old.y, 12);
  const surf = await c.renderSurface(sf, P, { showTwice: true });

  const SW = 700;
  const lines = [
    { t: `${rel} · ${theme} — tile ${old.x},${old.y} @ (${old.centerX},${old.centerY})`, s: 18, b: true, c: '#ffffff' },
    { t: `BEFORE (b857b11) ${a.localWarpMax.toFixed(2)}px — accepted as "${old.confidence}"`, s: 17, b: true, c: '#ff6b6b' },
    { t: `AFTER  (d4ecd4b) ${b.localWarpMax.toFixed(2)}px — tile rejected, page scores 0`, s: 17, b: true, c: '#7ee787' },
    { t: `same tile, same numbers: offset ${now.dx},${now.dy} · gain ${now.gain.toFixed(2)} · peak ${now.peak.toFixed(2)}`, s: 15, c: '#cfcfcf' },
    { t: `dispersion ${now.orientationDispersion.toFixed(2)}  — new split-peak floor 0.20 (was 0.05)`, s: 15, c: now.orientationDispersion < 0.2 ? '#ffd400' : '#cfcfcf' },
    { t: `boundaryPeak ${now.boundaryPeak}  — new: a weak peak on the ±12px rim can't be confident`, s: 15, c: now.boundaryPeak ? '#ffd400' : '#cfcfcf' },
    { t: `falloff ${now.falloff.toFixed(2)}  — new: score at 2× the offset must drop below the peak`, s: 15, c: now.falloff > 0.99 ? '#ffd400' : '#cfcfcf' },
    { t: `residual global shift (${b.globalDx}, ${b.globalDy}) — the page as a whole is registered`, s: 15, c: '#cfcfcf' },
  ];
  const stats = await v.png(sharp(Buffer.from(`<svg width="${SW}" height="${P}"><rect width="${SW}" height="${P}" fill="#1e1e1e"/>` +
    lines.map((l, i) => `<text x="12" y="${24 + i * 29}" font-family="DejaVu Sans, sans-serif" font-size="${l.s}" ${l.b ? 'font-weight="bold"' : ''} fill="${l.c}">${esc(l.t)}</text>`).join('') + '</svg>')).png());
  const cropOf = (buf) => sharp(buf).extract({ left: box.x0, top: box.y0, width: CROP, height: CROP }).resize(P, P, { kernel: 'nearest' }).removeAlpha().png();
  return v.rowOf([loc, await v.png(cropOf(source)), await v.png(cropOf(fill)),
    await v.png(v.edgeOverlay(sm, fm, sg.width, sg.height, box, 0, 0).resize(P, P, { kernel: 'nearest' })),
    await v.png(surf), stats], 8);
}

const rows = [await row('vehicles/excavator-wide', 'light'), await row('vehicles/excavator-wide', 'night')];
const width = rows[0].width;
const head = await v.png(sharp(Buffer.from(`<svg width="${width}" height="28"><rect width="${width}" height="28" fill="${BG}"/>` +
  ['where on the page','line art','painted fill','magenta line / cyan paint','correlation surface ±12px','before → after'].map((t,i)=>`<text x="${i*(250+8)+4}" y="21" font-family="DejaVu Sans, sans-serif" font-size="15" fill="#bdbdbd">${esc(t)}</text>`).join('') + '</svg>')).png());
const title = await v.png(sharp(Buffer.from(`<svg width="${width}" height="80"><rect width="${width}" height="80" fill="${BG}"/>` +
  `<text x="4" y="30" font-family="DejaVu Sans, sans-serif" font-size="24" font-weight="bold" fill="#ffffff">The page the issue was filed about: vehicles/excavator-wide</text>` +
  `<text x="4" y="58" font-family="DejaVu Sans, sans-serif" font-size="18" fill="#c9c9c9">Nothing about the image changed between BEFORE and AFTER. Only the confidence rules did.</text></svg>`)).png());
await writeFile('out/fig-excavator.png', await v.stackRows([title, head, ...rows.map(r=>({buffer:r.buffer,width:r.width,height:r.height}))]));
console.log('done');

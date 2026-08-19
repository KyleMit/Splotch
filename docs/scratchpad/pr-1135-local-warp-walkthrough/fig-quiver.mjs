import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import * as v from './warpviz.mjs';
import { localWarp } from '../../../tools/asset-gen/lib/local-warp.mjs';

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const BG = '#161616';
const REL = 'space/astronaut-wide', THEME = 'light';
const W = 640, SCALE_ARROW = 9;

const { source, fill } = await v.loadPair(REL, THEME);
const r = await localWarp(source, fill);
const meta = await sharp(fill).metadata();
const s = W / meta.width;
const H = Math.round(meta.height * s);
const base = await sharp(fill).resize(W, H).modulate({ brightness: 0.55 }).removeAlpha().toBuffer();

function quiver(subtract) {
  const parts = [];
  for (const t of r.tiles) {
    const dx = t.dx - (subtract ? r.globalDx : 0);
    const dy = t.dy - (subtract ? r.globalDy : 0);
    const cx = t.centerX * s, cy = t.centerY * s;
    const mag = Math.hypot(dx, dy);
    const col = mag >= 4 ? '#ff2d55' : mag >= 2 ? '#ffd400' : mag > 0 ? '#4ce6ff' : '#8fdc8f';
    if (mag === 0) { parts.push(`<circle cx="${cx}" cy="${cy}" r="2.4" fill="${col}" opacity="0.9"/>`); continue; }
    const ex = cx + dx * SCALE_ARROW, ey = cy + dy * SCALE_ARROW;
    parts.push(`<line x1="${cx}" y1="${cy}" x2="${ex}" y2="${ey}" stroke="${col}" stroke-width="${mag >= 4 ? 3.4 : 2.2}" stroke-linecap="round"/><circle cx="${ex}" cy="${ey}" r="${mag >= 4 ? 4 : 2.6}" fill="${col}"/>`);
  }
  const wt = r.worstTile;
  if (subtract && wt) parts.push(`<rect x="${(wt.centerX - 64) * s}" y="${(wt.centerY - 64) * s}" width="${128 * s}" height="${128 * s}" fill="none" stroke="#ff2d55" stroke-width="3"/>`);
  return Buffer.from(`<svg width="${W}" height="${H}">${parts.join('')}</svg>`);
}

const panels = [];
for (const [sub, capText] of [[false, `raw per-tile best offset — nearly every tile agrees on the same small nudge`], [true, `after subtracting the median (${r.globalDx}, ${r.globalDy}) — one tile is left standing`]]) {
  const img = await v.png(sharp(await sharp(base).composite([{ input: quiver(sub) }]).png().toBuffer()));
  const cap = await v.png(sharp(Buffer.from(`<svg width="${W}" height="30"><rect width="${W}" height="30" fill="${BG}"/><text x="4" y="21" font-family="DejaVu Sans, sans-serif" font-size="16" fill="#e0e0e0">${esc(capText)}</text></svg>`)).png());
  const st = await v.stackRows([cap, img]);
  const m = await sharp(st).metadata();
  panels.push({ buffer: st, width: m.width, height: m.height });
}
const body = await v.rowOf(panels, 16);
const legend = await v.png(sharp(Buffer.from(`<svg width="${body.width}" height="40"><rect width="${body.width}" height="40" fill="${BG}"/>` +
  `<text x="4" y="26" font-family="DejaVu Sans, sans-serif" font-size="16" fill="#8fdc8f">● 0px</text>` +
  `<text x="90" y="26" font-family="DejaVu Sans, sans-serif" font-size="16" fill="#4ce6ff">— under 2px</text>` +
  `<text x="230" y="26" font-family="DejaVu Sans, sans-serif" font-size="16" fill="#ffd400">— 2–4px</text>` +
  `<text x="350" y="26" font-family="DejaVu Sans, sans-serif" font-size="16" fill="#ff2d55">— over the 4px gate</text>` +
  `<text x="560" y="26" font-family="DejaVu Sans, sans-serif" font-size="16" fill="#a8a8a8">arrows drawn ${SCALE_ARROW}× actual length · ${r.scoredTiles} tiles scored</text></svg>`)).png());
const title = await v.png(sharp(Buffer.from(`<svg width="${body.width}" height="80"><rect width="${body.width}" height="80" fill="${BG}"/>` +
  `<text x="4" y="30" font-family="DejaVu Sans, sans-serif" font-size="24" font-weight="bold" fill="#ffffff">Why a median is subtracted: ${esc(REL)} · ${THEME}</text>` +
  `<text x="4" y="58" font-family="DejaVu Sans, sans-serif" font-size="18" fill="#c9c9c9">Every 128px tile votes on how far the paint sits from the line. The agreed-on vote is a rigid shift, not a warp.</text></svg>`)).png());
await writeFile('out/fig-quiver.png', await v.stackRows([title, legend, body]));
console.log('done', r.localWarpMax.toFixed(2), r.globalDx, r.globalDy, r.scoredTiles);

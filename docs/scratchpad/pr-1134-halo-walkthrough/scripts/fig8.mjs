import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';
const F = 'DejaVu Sans, Verdana, sans-serif';
const W = 1720, H = 730;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const txt = (x, y, s, o = {}) =>
  `<text x="${x}" y="${y}" font-size="${o.size ?? 16}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? '#4a4550'}" font-family="${F}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''}>${esc(s)}</text>`;
function chip(x, y, w, h, label, sub, fill, stroke) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`
    + txt(x + 14, y + 26, label, { size: 17, weight: 700, fill: '#1b1b1f' })
    + (sub ?? []).map((l, i) => txt(x + 14, y + 50 + i * 20, l, { size: 15 })).join('');
}
const arrow = (x1, y, x2, c = '#8a8290') =>
  `<line x1="${x1}" y1="${y}" x2="${x2 - 10}" y2="${y}" stroke="${c}" stroke-width="2"/><path d="M ${x2} ${y} l -11 -6 l 0 12 z" fill="${c}"/>`;

let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#faf7f2"/>`;
s += txt(40, 46, '8 · Which take gets kept — halo joins the ranking without displacing the loop’s stop rule', { size: 30, weight: 700, fill: '#1b1b1f' });
s += txt(40, 78, 'The retry loop stops as soon as a take is both drift-clean and passing. If halo were the first key, the run could stop on take 2', { size: 18 });
s += txt(40, 102, 'and then hand back take 1 — a take it had already walked away from. So drift class stays the first key and halo breaks ties inside it.', { size: 18 });

// ranking ladders
const y0 = 152, CW = 300, CH = 92;
s += txt(40, y0, 'takes that PASS every gate', { size: 19, weight: 700, fill: '#2f6b4f' });
const px = [40, 40 + CW + 40, 40 + 2 * (CW + 40)];
s += chip(px[0], y0 + 16, CW, CH, '1 · drift-clean class', ['a drift-clean take beats a', 'drifting one, always'], '#eef7f1', '#2f6b4f');
s += chip(px[1], y0 + 16, CW, CH, '2 · lower haloScore', ['NEW — breaks ties inside', 'the same drift class'], '#eef7f1', '#2f6b4f');
s += chip(px[2], y0 + 16, CW, CH, '3 · lower drift ratio', ['final tiebreak'], '#eef7f1', '#2f6b4f');
for (let i = 0; i < 2; i++) s += arrow(px[i] + CW, y0 + 16 + CH / 2, px[i + 1], '#2f6b4f');

const y1 = y0 + 150;
s += txt(40, y1, 'takes where nothing passed (fallback — you still get a render)', { size: 19, weight: 700, fill: '#8a3b3b' });
const FW = 250;
const fx = [40, 40 + FW + 30, 40 + 2 * (FW + 30), 40 + 3 * (FW + 30)];
s += chip(fx[0], y1 + 16, FW, CH, '1 · fewest dead eyes', ['unchanged — a lifeless', 'face outranks any scalar'], '#fbf1ee', '#8a3b3b');
s += chip(fx[1], y1 + 16, FW, CH, '2 · fewest failed gates', ['NEW'], '#fbf1ee', '#8a3b3b');
s += chip(fx[2], y1 + 16, FW, CH, '3 · lower haloScore', ['NEW'], '#fbf1ee', '#8a3b3b');
s += chip(fx[3], y1 + 16, FW, CH, '4 · lower drift', [''], '#fbf1ee', '#8a3b3b');
for (let i = 0; i < 3; i++) s += arrow(fx[i] + FW, y1 + 16 + CH / 2, fx[i + 1], '#8a3b3b');

// worked example
const yE = y1 + 160, bx = 40, bw = 1640, bh = 200;
s += `<rect x="${bx}" y="${yE}" width="${bw}" height="${bh}" rx="12" fill="#fff" stroke="#ddd6cc" stroke-width="2"/>`;
s += txt(bx + 20, yE + 32, 'the regression that pins the order (tests/night-candidate.test.mjs)', { size: 18, weight: 700, fill: '#1b1b1f' });
const cardW = 330, cy = yE + 52;
s += chip(bx + 20, cy, cardW, 84, 'take 1 · halo 1.90 · drift 0.05', ['passes every gate, but DRIFTS', '(threshold 0.004) → loop keeps going'], '#faf7f2', '#ddd6cc');
s += chip(bx + 20 + cardW + 30, cy, cardW, 84, 'take 2 · halo 1.95 · drift 0.0001', ['passes and is drift-clean →', 'loop STOPS here'], '#eef7f1', '#2f6b4f');
s += txt(bx + 20 + 2 * (cardW + 30), cy + 26, 'halo-first ordering would return take 1', { size: 17, weight: 700, fill: '#b3261e' });
s += txt(bx + 20 + 2 * (cardW + 30), cy + 50, '(1.90 < 1.95) — the take the loop already rejected as drifting.', { size: 16 });
s += txt(bx + 20 + 2 * (cardW + 30), cy + 78, 'drift-class-first ordering returns take 2', { size: 17, weight: 700, fill: '#2f6b4f' });
s += txt(bx + 20 + 2 * (cardW + 30), cy + 102, '— the take that stopped the loop. Halo still decides between two', { size: 16 });
s += txt(bx + 20 + 2 * (cardW + 30), cy + 124, 'takes in the same drift class.', { size: 16 });
s += '</svg>';
await writeFile('out/fig8-ranking.png', await sharp(Buffer.from(s)).png().toBuffer());
console.log('fig8 ok');

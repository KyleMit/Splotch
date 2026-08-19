import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const results = JSON.parse(await readFile('/tmp/claude-0/-home-user-Splotch/dac8fce1-adde-5681-9d1f-eb61e4f6487e/scratchpad/halo/audit.json', 'utf8'));
results.sort((a, b) => b.haloScore - a.haloScore);
const ceilings = {
  'shapes/rectangle-tall': 4.3, 'shapes/heart-tall': 3.2, 'nature/spider-tall': 2.8,
  'objects/house-tall': 2.5, 'vehicles/fire-tall': 2.5, 'objects/house-wide': 2.3, 'space/station-tall': 2.1,
};
const F = 'DejaVu Sans, Verdana, sans-serif';
const W = 1880, H = 700, padL = 64, padT = 168, padB = 96;
const plotW = 900, plotH = H - padT - padB;
const maxY = 4.6, bw = plotW / results.length;
const y = (v) => padT + plotH - (v / maxY) * plotH;
let bars = '';
results.forEach((r, i) => {
  const over = r.haloScore > 2;
  const x = padL + i * bw;
  const top = y(r.haloScore);
  bars += `<rect x="${x + 0.8}" y="${top}" width="${bw - 1.6}" height="${Math.max(1.2, padT + plotH - top)}" fill="${over ? '#d81b60' : '#3f8f6f'}"/>`;
});
let axis = '';
for (let v = 0; v <= 4; v++) {
  axis += `<line x1="${padL}" y1="${y(v)}" x2="${padL + plotW}" y2="${y(v)}" stroke="#e6e0d8"/>`
    + `<text x="${padL - 10}" y="${y(v) + 5}" font-size="15" fill="#5b5560" text-anchor="end" font-family="${F}">${v}</text>`;
}
// callout bracket over the 7 rejects
const bx = padL, bxe = padL + 7 * bw;
const tableX = padL + plotW + 70;
let rows = `<text x="${tableX}" y="${padT - 14}" font-size="19" font-weight="700" fill="#1b1b1f" font-family="${F}">The 7 pages above the default bar — all previously shipped and reviewed</text>`;
const cols = [0, 280, 400, 520, 650];
const head = ['page', 'haloScore', 'ceiling set', 'rawScore', 'crop review?'];
head.forEach((h, i) => { rows += `<text x="${tableX + cols[i]}" y="${padT + 18}" font-size="16" font-weight="700" fill="#5b5560" font-family="${F}">${h}</text>`; });
results.filter((r) => r.haloScore > 2).forEach((r, i) => {
  const ry = padT + 52 + i * 32;
  const cells = [r.page, String(r.haloScore), String(ceilings[r.page]), String(r.rawScore), r.cropReview ? 'yes (>5)' : 'no'];
  cells.forEach((c, j) => {
    const color = j === 4 && r.cropReview ? '#b26a00' : j === 0 ? '#1b1b1f' : '#3a353f';
    rows += `<text x="${tableX + cols[j]}" y="${ry}" font-size="17" font-weight="${j === 0 ? 600 : 400}" fill="${color}" font-family="${F}">${c}</text>`;
  });
  rows += `<line x1="${tableX}" y1="${ry + 10}" x2="${tableX + 770}" y2="${ry + 10}" stroke="#ece6de"/>`;
});
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="#faf7f2"/>
<text x="${padL}" y="46" font-size="30" font-weight="700" fill="#1b1b1f" font-family="${F}">3 · Every shipped night page, scored — where the new bar falls</text>
<text x="${padL}" y="80" font-size="19" fill="#4a4550" font-family="${F}">All 96 shipped night fills, re-scored with this PR's code (node tools/asset-gen/coloring/check-night-halo.mjs). Each bar is one page's haloScore, sorted.</text>
<text x="${padL}" y="106" font-size="19" fill="#4a4550" font-family="${F}">The dashed line is the new strict default, NIGHT_HALO_SCORE_MAX = 2 — what an unreviewed candidate must clear to be accepted automatically.</text>
<text x="${padL}" y="132" font-size="19" fill="#4a4550" font-family="${F}">89 of 96 pages already clear it (73 score below 0.2). The 7 that do not are the seven per-page ceilings this PR writes into fill-src/&lt;category&gt;/notes.json.</text>
${axis}${bars}${rows}
<line x1="${padL}" y1="${y(2)}" x2="${padL + plotW}" y2="${y(2)}" stroke="#d81b60" stroke-width="2" stroke-dasharray="8 6"/>
<text x="${padL + plotW}" y="${y(2) - 10}" font-size="16" font-weight="700" fill="#d81b60" text-anchor="end" font-family="${F}">haloScore = 2</text>
<path d="M ${bx} ${padT + plotH + 14} L ${bx} ${padT + plotH + 24} L ${bxe} ${padT + plotH + 24} L ${bxe} ${padT + plotH + 14}" fill="none" stroke="#d81b60" stroke-width="2"/>
<text x="${bxe + 10}" y="${padT + plotH + 29}" font-size="16" font-weight="600" fill="#d81b60" font-family="${F}">7 rejected by the default</text>
<text x="${padL}" y="${padT + plotH + 62}" font-size="16" fill="#5b5560" font-family="${F}">← 96 shipped night pages, worst halo first →</text>
</svg>`;
await writeFile('out/fig3-catalog.png', await sharp(Buffer.from(svg)).png().toBuffer());
console.log('fig3 ok');

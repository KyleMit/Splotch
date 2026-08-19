import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';
const F = 'DejaVu Sans, Verdana, sans-serif';
const W = 1720, H = 660;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function box(x, y, w, h, title, lines, fill, stroke) {
  let t = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
  t += `<text x="${x + 14}" y="${y + 27}" font-size="17" font-weight="700" fill="#1b1b1f" font-family="${F}">${esc(title)}</text>`;
  lines.forEach((l, i) => {
    t += `<text x="${x + 14}" y="${y + 51 + i * 21}" font-size="15" fill="#4a4550" font-family="${F}">${esc(l)}</text>`;
  });
  return t;
}
const arrow = (x1, y, x2, color = '#8a8290') =>
  `<line x1="${x1}" y1="${y}" x2="${x2 - 10}" y2="${y}" stroke="${color}" stroke-width="2"/><path d="M ${x2} ${y} l -11 -6 l 0 12 z" fill="${color}"/>`;

const LANE_X = 40, BW = 250, BH = 132, GAP = 44;
const xs = [0, 1, 2, 3, 4].map((i) => LANE_X + 200 + i * (BW + GAP));
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#faf7f2"/>
<text x="${LANE_X}" y="46" font-size="30" font-weight="700" fill="#1b1b1f" font-family="${F}">6 · Where the gate sits in the generator loop</text>
<text x="${LANE_X}" y="78" font-size="19" fill="#4a4550" font-family="${F}">Before this PR nothing in the generator ever looked at the punched image — the halo scorer existed only as an audit over pages that had already shipped.</text>`;

const yBefore = 140, yAfter = 380;
svg += `<text x="${LANE_X}" y="${yBefore + 55}" font-size="20" font-weight="700" fill="#8a3b3b" font-family="${F}">BEFORE</text>`;
svg += `<text x="${LANE_X}" y="${yBefore + 80}" font-size="15" fill="#8a3b3b" font-family="${F}">base branch</text>`;
svg += box(xs[0], yBefore, BW, BH, 'generate take', ['Gemini render, rising', 'temperature per attempt'], '#fff', '#ddd6cc');
svg += box(xs[1], yBefore, BW, BH, 'align to line art', ['undo the model nudge'], '#fff', '#ddd6cc');
svg += box(xs[2], yBefore, BW, BH, 'score the RAW take', ['drift · bgLuma · lineWhite', 'eyes (on composite)', 'fill decoded 3x, source 2x'], '#fff', '#ddd6cc');
svg += box(xs[3], yBefore, BW, BH, 'rank', ['dead eyes, then drift'], '#fff', '#ddd6cc');
svg += box(xs[4], yBefore, BW, BH, 'write candidate', ['ship by hand afterwards'], '#fff', '#ddd6cc');
for (let i = 0; i < 4; i++) svg += arrow(xs[i] + BW, yBefore + BH / 2, xs[i + 1]);
svg += `<text x="${xs[2] + 8}" y="${yBefore + BH + 26}" font-size="16" font-weight="700" fill="#b3261e" font-family="${F}">✗ the punch — the thing that actually ships — is never measured</text>`;

svg += `<text x="${LANE_X}" y="${yAfter + 55}" font-size="20" font-weight="700" fill="#2f6b4f" font-family="${F}">AFTER</text>`;
svg += `<text x="${LANE_X}" y="${yAfter + 80}" font-size="15" fill="#2f6b4f" font-family="${F}">this PR</text>`;
svg += box(xs[0], yAfter, BW, BH, 'generate take', ['unchanged'], '#fff', '#ddd6cc');
svg += box(xs[1], yAfter, BW, BH, 'punch in memory', ['exact bytes that would ship', 'lib/night-halo.punchNight…'], '#eef7f1', '#2f6b4f');
svg += box(xs[2], yAfter, BW, BH, 'score once, one decode', ['drift · bgLuma · lineWhite', 'HALO (punched) · eyes', 'resizes cached by size'], '#eef7f1', '#2f6b4f');
svg += box(xs[3], yAfter, BW, BH, 'rank + stop early', ['pass → drift-clean → halo', 'fallback → eyes first'], '#eef7f1', '#2f6b4f');
svg += box(xs[4], yAfter, BW, BH, '--rescore / --apply', ['re-gate offline, no API key', 'apply writes raw + punches'], '#eef7f1', '#2f6b4f');
for (let i = 0; i < 4; i++) svg += arrow(xs[i] + BW, yAfter + BH / 2, xs[i + 1], '#2f6b4f');
svg += `<text x="${xs[1] + 8}" y="${yAfter + BH + 26}" font-size="16" font-weight="700" fill="#2f6b4f" font-family="${F}">✓ haloScore ≤ 2 (or the page's reviewed ceiling) is now required before a take can be kept or shipped</text>`;
svg += `<text x="${LANE_X}" y="${H - 26}" font-size="16" fill="#4a4550" font-family="${F}">Run failures are counted separately now: renders that threw, candidates that failed a gate, and candidates missing for --apply — each reported, all three nonzero-exit.</text>`;
svg += '</svg>';
await writeFile('out/fig6-pipeline.png', await sharp(Buffer.from(svg)).png().toBuffer());
console.log('fig6 ok');

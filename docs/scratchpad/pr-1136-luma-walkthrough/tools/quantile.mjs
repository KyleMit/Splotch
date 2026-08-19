import sharp from 'sharp';
import { esc } from './lib.mjs';
import { quantile, median } from '../tools/asset-gen/lib/image-stats.mjs';

const OUT = 'viz/out/H1-quantile.png';
const BG = '#0d1117', FG = '#e6edf3', DIM = '#8b949e';

// two toy sets, one odd one even, plus the even case the comment is about
const sets = [
  { name: 'odd length (n = 5)', vals: [10, 20, 30, 40, 50] },
  { name: 'even length (n = 6)', vals: [10, 20, 30, 40, 50, 60] },
  { name: 'even length (n = 4) — real band lumas', vals: [48, 121, 203, 254] },
];

const SW = 96, SH = 96, GAP = 12, PAD = 30;
const W0 = PAD * 2 + Math.max(...sets.map((s) => s.vals.length)) * (SW + GAP) + 340;
const W = Math.max(W0, 1240);
const rowH = SH + 92;
const H = PAD * 2 + 96 + sets.length * rowH;
const parts = [`<rect width="${W}" height="${H}" fill="${BG}"/>`];
parts.push(`<text x="${PAD}" y="${PAD + 24}" font-family="ui-monospace,Menlo,monospace" font-size="24" font-weight="700" fill="${FG}">The median convention this PR wrote down</text>`);
parts.push(`<text x="${PAD}" y="${PAD + 50}" font-family="ui-monospace,Menlo,monospace" font-size="14" fill="${DIM}">quantile(vals, f) indexes floor(f * (n - 1)) into the sorted copy. At f = 0.5 with an EVEN count that picks the LOWER</text>`);
parts.push(`<text x="${PAD}" y="${PAD + 69}" font-family="ui-monospace,Menlo,monospace" font-size="14" fill="${DIM}">middle value — it never averages the two. Every swatch below is a real luma value; the yellow one is what median() returns.</text>`);

let y = PAD + 100;
for (const s of sets) {
  const m = median(s.vals);
  const avg = s.vals.length % 2 === 0 ? (s.vals[s.vals.length / 2 - 1] + s.vals[s.vals.length / 2]) / 2 : m;
  parts.push(`<text x="${PAD}" y="${y + 16}" font-family="ui-monospace,Menlo,monospace" font-size="14" font-weight="600" fill="${FG}">${esc(s.name)}  ·  floor(0.5 * ${s.vals.length - 1}) = index ${Math.floor(0.5 * (s.vals.length - 1))}</text>`);
  s.vals.forEach((v, i) => {
    const x = PAD + i * (SW + GAP);
    const picked = v === m && i === Math.floor(0.5 * (s.vals.length - 1));
    const g = Math.round(v);
    parts.push(`<rect x="${x}" y="${y + 30}" width="${SW}" height="${SH}" fill="rgb(${g},${g},${g})" stroke="${picked ? '#ffd166' : '#30363d'}" stroke-width="${picked ? 5 : 1}"/>`);
    parts.push(`<text x="${x + SW / 2}" y="${y + 30 + SH + 18}" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-size="13" fill="${picked ? '#ffd166' : DIM}">${v}</text>`);
    parts.push(`<text x="${x + SW / 2}" y="${y + 30 + SH + 34}" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-size="11" fill="#484f58">idx ${i}</text>`);
  });
  const tx = PAD + s.vals.length * (SW + GAP) + 16;
  parts.push(`<text x="${tx}" y="${y + 60}" font-family="ui-monospace,Menlo,monospace" font-size="15" fill="#ffd166">median() = ${m}</text>`);
  if (s.vals.length % 2 === 0)
    parts.push(`<text x="${tx}" y="${y + 84}" font-family="ui-monospace,Menlo,monospace" font-size="15" fill="#ff7b72">textbook average = ${avg}</text>`);
  else
    parts.push(`<text x="${tx}" y="${y + 84}" font-family="ui-monospace,Menlo,monospace" font-size="15" fill="${DIM}">(odd: no ambiguity)</text>`);
  y += rowH;
}
await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join('')}</svg>`)).png().toFile(OUT);
console.log('quantile checks:', JSON.stringify(sets.map((s) => [s.vals.length, median(s.vals), quantile(s.vals, 0.15), quantile(s.vals, 0.85)])));

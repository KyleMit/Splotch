import { writeFile } from 'node:fs/promises';
import { analyzePage, paint, crop, grid } from './viz-lib.mjs';

const a = await analyzePage('shapes/rectangle-tall');
const lum = (p) => 0.299 * a.shipped[p * 3] + 0.587 * a.shipped[p * 3 + 1] + 0.114 * a.shipped[p * 3 + 2];
const excluded = new Uint8Array(a.w * a.h);
let nDark = 0, nLight = 0;
for (let p = 0; p < a.w * a.h; p++) {
  if (!a.rim[p] || a.halo[p]) continue;
  excluded[p] = 1;
  if (lum(p) < 55) nDark++; else nLight++;
}
const Z = 4, S = 130;
const rows = [
  { label: 'EYE — deliberate near-black ink', box: { left: 300, top: 700, width: S, height: S } },
  { label: 'BUBBLE — genuine punched rim', box: { left: 600, top: 60, width: S, height: S } },
];
const cells = [];
for (const r of rows) {
  cells.push({ buf: await crop(a.shipped, a.w, a.h, r.box, Z), caption: [r.label, `shipped fill @ ${r.box.left},${r.box.top}`] });
  cells.push({ buf: await crop(paint(a.shipped, a.w, a.h, [{ mask: a.rim, color: [0, 229, 255] }]), a.w, a.h, r.box, Z), caption: ['cyan = darker than reference', 'this is what rawScore counts'] });
  cells.push({ buf: await crop(paint(a.shipped, a.w, a.h, [{ mask: excluded, color: [0, 229, 255] }, { mask: a.halo, color: [255, 40, 190] }]), a.w, a.h, r.box, Z), caption: ['magenta = inside the 55–145 window', 'this is what the GATE counts'] });
}
await writeFile('out/fig2-window.png', await grid({
  cells, cols: 3, cellW: S * Z, cellH: S * Z, capSize: 18,
  title: '2 · Why two numbers — the mid-dark window keeps deliberate black art out of the gate',
  subtitle: [`shapes/rectangle-tall. Top row: the eye ink is darker than the reference everywhere (cyan) but almost none of it is counted — it is art.`,
    `Bottom row: the bubble rim is the real artefact and it goes magenta. Window drops ${nDark.toLocaleString()} near-black + ${nLight.toLocaleString()} light px page-wide: rawScore ${a.rawScore} → haloScore ${a.haloScore}.`],
}));
console.log('fig2 ok');

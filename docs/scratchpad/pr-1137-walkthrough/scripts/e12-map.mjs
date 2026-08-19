import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { raw, svgLabel, stack, esc } from './lib.mjs';

const ROWS = [
  { gen: 'gen-chalk-outlines.mjs', q: 92, sample: 'web/static/coloring/creatures/owl-wide.chalk.webp', writes: 'web/static/coloring/**/*.chalk.webp', count: '96 shipped files' },
  { gen: 'normalize-outline-strokes.mjs', q: 92, sample: 'web/static/coloring/farm/cat-tall.outline.webp', writes: 'web/static/coloring/**/*.outline.webp (--apply)', count: 'any of the 104, on demand' },
  { gen: 'gen-fresh-outlines.mjs', q: 90, sample: 'web/static/coloring/space/astronaut-tall.outline.webp', writes: 'web/static/coloring/**/*.outline.webp (--apply)', count: 'any of the 104, on demand' },
  { gen: 'gen-light-fills.mjs', q: 90, sample: 'tools/asset-gen/fill-src/creatures/owl-wide.light.raw.webp', writes: 'tools/asset-gen/fill-src/**/*.light.raw.webp', count: '96 raws -> 192 shipped' },
  { gen: 'gen-night-fills.mjs', q: 90, sample: 'tools/asset-gen/fill-src/creatures/owl-wide.night.raw.webp', writes: 'fill-src/**/*.night.raw.webp + a transient model input', count: '96 raws -> 192 shipped' },
  { gen: 'gen-style-covers.mjs', q: 75, sample: 'web/static/styles/clay.light.webp', writes: 'web/static/styles/*.webp', count: '16 shipped files' },
];

const TH = 128, BARW = 300, ROWH = 150, TEXTW = 560;
async function composition(file) {
  const { data } = await raw(file);
  let black = 0, white = 0;
  for (const v of data) { if (v < 8) black++; else if (v > 247) white++; }
  return { black: black / data.length, white: white / data.length, mid: 1 - (black + white) / data.length };
}

const rows = [];
for (const r of ROWS) {
  const c = await composition(r.sample);
  const thumb = await sharp(r.sample).resize(TH, TH, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
  const segs = [
    { w: c.black, fill: '#111827', label: 'pure black' },
    { w: c.white, fill: '#ffffff', label: 'pure white' },
    { w: c.mid, fill: '#f59e0b', label: 'midtone' },
  ];
  let x = 0;
  const bars = segs.map((s) => { const w = Math.max(0, s.w * BARW); const el = `<rect x="${x}" y="0" width="${w}" height="26" fill="${s.fill}"/>`; x += w; return el; }).join('');
  const bar = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${BARW}" height="52"><rect width="${BARW}" height="26" fill="#fff" stroke="#d1d5db"/>${bars}<rect width="${BARW}" height="26" fill="none" stroke="#9ca3af"/><text x="0" y="45" font-family="-apple-system,sans-serif" font-size="13" fill="#6b7280">${esc(`${(c.black*100).toFixed(0)}% black · ${(c.white*100).toFixed(0)}% white · ${(c.mid*100).toFixed(0)}% midtone`)}</text></svg>`);
  const qcolor = r.q === 92 ? '#166534' : r.q === 90 ? '#92400e' : '#991b1b';
  const text = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${TEXTW}" height="${ROWH}"><rect width="${TEXTW}" height="${ROWH}" fill="#ffffff"/>
    <text x="0" y="34" font-family="-apple-system,sans-serif" font-size="20" font-weight="700" fill="#111827">${esc(r.gen)}</text>
    <text x="0" y="66" font-family="-apple-system,sans-serif" font-size="26" font-weight="700" fill="${qcolor}">WEBP_QUALITY = ${r.q}</text>
    <text x="0" y="98" font-family="-apple-system,sans-serif" font-size="14" fill="#374151">writes ${esc(r.writes)}</text>
    <text x="0" y="122" font-family="-apple-system,sans-serif" font-size="14" fill="#6b7280">${esc(r.count)}</text></svg>`);
  rows.push(await stack([
    await sharp({ create: { width: TH, height: ROWH, channels: 3, background: '#ffffff' } })
      .composite([{ input: thumb, left: 0, top: Math.round((ROWH - TH) / 2) }]).png().toBuffer(),
    await sharp(text).png().toBuffer(),
    await sharp({ create: { width: BARW, height: ROWH, channels: 3, background: '#ffffff' } })
      .composite([{ input: await sharp(bar).png().toBuffer(), left: 0, top: Math.round((ROWH - 52) / 2) }]).png().toBuffer(),
  ], { gap: 14, dir: 'h' }));
}
const body = await stack(rows, { gap: 8, bg: '#e5e7eb' });
const bw = (await sharp(body).metadata()).width;
await writeFile('.viz/out/e12-map.png', await stack([
  svgLabel(bw, 62, ['the six constants this PR comments — what each one actually encodes',
    { t: 'the bar is the pixel makeup of that generator’s own output: hard black/white art vs soft paint', size: 15, weight: 400, fg: '#6b7280' }], { size: 23, bg: '#f3f4f6' }),
  body,
], { gap: 8, bg: '#e5e7eb' }));
console.log('ok');

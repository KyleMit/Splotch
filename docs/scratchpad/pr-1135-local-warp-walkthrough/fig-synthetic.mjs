import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import * as v from './warpviz.mjs';
import { localWarp } from '../../../tools/asset-gen/lib/local-warp.mjs';

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const BG = '#161616';
const P = 366;

function lineArt({ shiftedFeatureX = 0, shiftedFeatureY = 0, background = 'white', stroke = 'black' } = {}) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect width="512" height="512" fill="${background}"/>
      <g fill="none" stroke="${stroke}" stroke-width="8">
        <circle cx="96" cy="96" r="48"/>
        <rect x="304" y="48" width="112" height="96" rx="20"/>
        <path d="M48 352 Q96 272 160 352 T272 352"/>
        <g transform="translate(${shiftedFeatureX} ${shiftedFeatureY})">
          <rect x="328" y="304" width="88" height="128" rx="18"/>
          <path d="M344 336 L400 400 M400 336 L344 400"/>
        </g>
      </g>
    </svg>`);
}
const rendered = (o) => sharp(lineArt(o)).png().toBuffer();

const source = await rendered({});

async function translated(shift) {
  return sharp(source).affine([[1, 0], [0, 1]], { idx: shift, idy: -shift, background: '#ffffff' }).png().toBuffer();
}

const cases = [
  { key: 'ref', title: 'A · reference', sub: 'line art = paint', buf: source },
  { key: 'rigid', title: 'B · whole image slid +4, -4', sub: 'every shape moved together', buf: await translated(4) },
  { key: 'local', title: 'C · only the X-box slid +8, -6', sub: 'one feature moved on its own', buf: await rendered({ shiftedFeatureX: 8, shiftedFeatureY: -6 }) },
  { key: 'night', title: 'D · night, X-box slid +20', sub: 'inverted colours, past the window', buf: await rendered({ shiftedFeatureX: 20, background: '#182450', stroke: '#ffffff' }) },
];

const sg = await v.gray(source);
const sm = v.edgeMag(sg.data, sg.width, sg.height);
const cols = [];
for (const cs of cases) {
  const score = await localWarp(source, cs.buf);
  const fg = await v.gray(cs.buf);
  const fm = v.edgeMag(fg.data, fg.width, fg.height);
  const overlay = v.edgeOverlay(sm, fm, sg.width, sg.height, { x0: 0, y0: 0, w: 512, h: 512 }).resize(P, P);
  const wt = score.worstTile;
  const pass = score.localWarpMax <= 4;
  const img = await sharp(cs.buf).resize(P, P).removeAlpha().toBuffer();
  const marked = wt
    ? await sharp(img).composite([{ input: Buffer.from(`<svg width="${P}" height="${P}"><rect x="${(wt.centerX - 64) * P / 512}" y="${(wt.centerY - 64) * P / 512}" width="${128 * P / 512}" height="${128 * P / 512}" fill="none" stroke="#ff2d55" stroke-width="3"/></svg>`) }]).png().toBuffer()
    : await sharp(img).png().toBuffer();
  const verdict = [
    `residual global shift  (${score.globalDx}, ${score.globalDy})`,
    `local warp  ${score.localWarpMax.toFixed(2)} px`,
    wt ? `tile ${wt.x},${wt.y} · ${wt.confidence}${wt.clamped ? ' · clamped' : ''}` : 'no confident tile',
    pass ? 'PASS  (≤ 4px gate)' : 'FAIL  (> 4px gate)',
  ];
  const vp = sharp(Buffer.from(`<svg width="${P}" height="132"><rect width="${P}" height="132" fill="#1e1e1e"/>` +
    verdict.map((t, i) => `<text x="10" y="${26 + i * 28}" font-family="DejaVu Sans, sans-serif" font-size="${i === 3 ? 20 : 17}" font-weight="${i >= 1 ? 'bold' : 'normal'}" fill="${i === 3 ? (pass ? '#7ee787' : '#ff6b6b') : i === 1 ? (pass ? '#e8e8e8' : '#ff9f6b') : '#cfcfcf'}">${esc(t)}</text>`).join('') +
    `</svg>`)).png();
  const head = sharp(Buffer.from(`<svg width="${P}" height="56"><rect width="${P}" height="56" fill="${BG}"/><text x="4" y="24" font-family="DejaVu Sans, sans-serif" font-size="19" font-weight="bold" fill="#ffffff">${esc(cs.title)}</text><text x="4" y="46" font-family="DejaVu Sans, sans-serif" font-size="16" fill="#a8a8a8">${esc(cs.sub)}</text></svg>`)).png();
  const capOverlay = sharp(Buffer.from(`<svg width="${P}" height="28"><rect width="${P}" height="28" fill="${BG}"/><text x="4" y="20" font-family="DejaVu Sans, sans-serif" font-size="15" fill="#bdbdbd">edges — magenta: reference · cyan: this image</text></svg>`)).png();
  cols.push(await v.stackRows([
    await v.png(head),
    await v.png(sharp(marked)),
    await v.png(capOverlay),
    await v.png(overlay),
    await v.png(vp),
  ]));
}

const metas = await Promise.all(cols.map((b) => sharp(b).metadata()));
const body = await v.rowOf(cols.map((b, i) => ({ buffer: b, width: metas[i].width, height: metas[i].height })), 14);
const title = await v.png(sharp(Buffer.from(`<svg width="${body.width}" height="76"><rect width="${body.width}" height="76" fill="${BG}"/><text x="4" y="30" font-family="DejaVu Sans, sans-serif" font-size="24" font-weight="bold" fill="#ffffff">What the new gate actually separates (the controlled test shapes from local-warp.test.mjs)</text><text x="4" y="60" font-family="DejaVu Sans, sans-serif" font-size="18" fill="#c9c9c9">A whole-image slide is subtracted as &quot;residual global shift&quot;. Only a feature that moved BY ITSELF counts as local warp.</text></svg>`)).png());
await writeFile('out/fig-synthetic.png', await v.stackRows([title, { buffer: body.buffer, width: body.width, height: body.height }]));
console.log('ok');

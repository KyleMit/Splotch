import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { grid } from './figure.mjs';
import {
  findEyeCores,
  scoreEyeFill,
  EYE_DARK_MAX,
  EYE_LIGHT_MIN,
  EYE_CONTRAST_MIN,
} from '../tools/asset-gen/lib/eye-fill.mjs';

const COLORING = 'web/static/coloring';
const FILLSRC = 'tools/asset-gen/fill-src';
const OUT = 'viz/out';

const PAGES = [
  'creatures/dragon-wide',
  'farm/cow-wide',
  'nature/ladybug-wide',
  'creatures/unicorn-tall',
];

const panels = [];
const rows = [];
for (const page of PAGES) {
  const src = await readFile(join(COLORING, `${page}.outline.webp`));
  const fillPath = join(FILLSRC, `${page}.light.raw.webp`);
  const fill = await readFile(fillPath);
  const { cores, w, h } = await findEyeCores(src);
  const scored = await scoreEyeFill(fill, src);
  const byId = new Map(scored.cores.map((c) => [c.regionId, c]));
  // crop a window around the eye cluster
  const xs = cores.flatMap((c) => [c.minX, c.maxX]),
    ys = cores.flatMap((c) => [c.minY, c.maxY]);
  if (!xs.length) continue;
  const pad = Math.round(
    Math.max(...xs.map((v, i) => 0), 40) + (Math.max(...xs) - Math.min(...xs)) * 0.6 + 30
  );
  let x0 = Math.max(0, Math.min(...xs) - pad),
    y0 = Math.max(0, Math.min(...ys) - pad);
  let x1 = Math.min(w, Math.max(...xs) + pad),
    y1 = Math.min(h, Math.max(...ys) + pad);
  const cw = x1 - x0,
    ch = y1 - y0;
  const fillResized = await sharp(fill)
    .removeAlpha()
    .resize(w, h, { fit: 'fill' })
    .png()
    .toBuffer();
  const crop = async (b) =>
    sharp(b)
      .extract({ left: x0, top: y0, width: cw, height: ch })
      .resize(520, null)
      .png()
      .toBuffer();
  const scale = 520 / cw;
  const marks = cores
    .map((c) => {
      const s = byId.get(c.id);
      const rx = (c.minX - x0) * scale,
        ry = (c.minY - y0) * scale;
      const rw = (c.maxX - c.minX + 1) * scale,
        rh = (c.maxY - c.minY + 1) * scale;
      const col = '#ffd166';
      const txt = s
        ? `core ${s.coreLuma.toFixed(0)} \u00b7 ring p15 ${s.bandDark.toFixed(0)} / p85 ${s.bandLight.toFixed(0)}`
        : 'core (unmeasured)';
      const boxW = txt.length * 7.3 + 8;
      const tx = Math.max(6, Math.min(rx + rw + 10, 520 - boxW - 4));
      const ty = ry < 40 ? ry + rh + 22 : ry - 8;
      return (
        `<rect x="${rx - 2}" y="${ry - 2}" width="${rw + 4}" height="${rh + 4}" fill="none" stroke="${col}" stroke-width="2.5"/>` +
        (s
          ? `<circle cx="${rx + rw / 2}" cy="${ry + rh / 2}" r="${Math.max(rw, rh) / 2 + 14 * scale}" fill="none" stroke="#58a6ff" stroke-width="1.4" stroke-dasharray="5 4"/>`
          : '') +
        `<rect x="${tx - 4}" y="${ty - 14}" width="${boxW}" height="19" fill="#0d1117" fill-opacity="0.85"/>` +
        `<text x="${tx}" y="${ty}" font-family="ui-monospace,Menlo,monospace" font-size="12" fill="#ffd166">${txt}</text>`
      );
    })
    .join('');
  const cropPng = await crop(fillResized);
  const meta = await sharp(cropPng).metadata();
  const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}">${marks}</svg>`;
  const annotated = await sharp(cropPng)
    .composite([{ input: Buffer.from(overlay) }])
    .png()
    .toBuffer();
  const outlinePng = await crop(
    await sharp(src).removeAlpha().resize(w, h, { fit: 'fill' }).png().toBuffer()
  );
  const lively = scored.cores.filter((c) => c.lively).length;
  panels.push(
    { png: outlinePng, label: `${page} — line art`, sub: `${cores.length} nested cores found` },
    {
      png: annotated,
      label: 'light fill, measured',
      sub: 'yellow box = core · blue dashed = annulus band',
    }
  );
  rows.push({
    page,
    cores: scored.cores.map(
      (c) =>
        `core@(${c.x},${c.y}) coreLuma=${c.coreLuma.toFixed(0)} p15=${c.bandDark.toFixed(0)} p85=${c.bandLight.toFixed(0)} lively=${c.lively}`
    ),
  });
}
await grid({
  title: 'Gate C — eye-fill.mjs',
  subtitle: `Every number printed here is read out of the per-pixel luma array this PR moved onto luma(). The yellow box is a nested "core" found in the line art (a catchlight, a pupil); the blue dashed ring is the annulus sampled around it, skipping pixels near ink. Its median and the ring's p15/p85 decide whether the eye reads lively (core <= ${EYE_DARK_MAX} or >= ${EYE_LIGHT_MIN}, and contrast >= ${EYE_CONTRAST_MIN}). These readings are identical before and after the refactor.`,
  panels,
  cols: 2,
  cell: 400,
  out: `${OUT}/D1-eye.png`,
});
console.log(JSON.stringify(rows, null, 1));

import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { analyzePage, paint, crop, grid, toPng } from './viz-lib.mjs';
import { compositeNight } from '/home/user/Splotch/tools/asset-gen/lib/night-composite.mjs';

const page = 'shapes/rectangle-tall';
const a = await analyzePage(page);
const box = { left: 612, top: 66, width: 100, height: 100 };
const Z = 5;
const compBuf = await compositeNight(await toPng({ rgb: a.shipped, w: a.w, h: a.h }), a.chalk ?? a.lineArt);
const c = await sharp(compBuf).removeAlpha().raw().toBuffer({ resolveWithObject: true });

const cells = [
  { buf: await crop(a.raw, a.w, a.h, box, Z), caption: ['1 · RAW take from the model', 'dark ink hugging its white lines'] },
  { buf: await crop(a.shipped, a.w, a.h, box, Z), caption: ['2 · SHIPPED punched fill', 'ink removed — grey rim survives'] },
  { buf: await crop(a.refRgb, a.w, a.h, box, Z), caption: ['3 · REFERENCE punch (dilate 4px)', 'what a rim-free fill looks like'] },
  { buf: await crop(paint(a.shipped, a.w, a.h, [{ mask: a.halo, color: [255, 40, 190] }]), a.w, a.h, box, Z), caption: ['4 · counted halo pixels', `ring 1-2px, ref−shipped > 40, luma 55–145`] },
  { buf: await crop(c.data, a.w, a.h, box, Z), caption: ['5 · what a child sees', 'grey shadow hugging the white chalk'] },
  { buf: await crop(paint(c.data, a.w, a.h, [{ mask: a.halo, color: [255, 40, 190] }]), a.w, a.h, box, Z), caption: ['6 · same view, halo marked', `haloScore ${a.haloScore} (page-wide)`] },
];
await writeFile('out/fig1-anatomy.png', await grid({
  cells, cols: 3, cellW: box.width * Z, cellH: box.height * Z, capSize: 19,
  title: '1 · What "halo" means — shapes/rectangle-tall, bubble at 612,66 (100px crop, 5x)',
  subtitle: ['The night fill ships PUNCHED: the line art is erased from it and the app lays white chalk lines back on top.',
    'When the model re-inks or shadows its own outlines, erasing the ink leaves a mid-dark rim that no earlier gate could see.'],
}));
console.log('fig1 ok');

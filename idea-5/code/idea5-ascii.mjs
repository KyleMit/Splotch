import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { COLORING_DIR } from './lib/paths.mjs';

const [page, l, t, w, h, step = '2'] = process.argv.slice(2);
const buf = await readFile(join(COLORING_DIR, `${page}.outline.webp`));
const { data, info } = await sharp(buf).grayscale().raw().toBuffer({ resolveWithObject: true });
const s = +step;
for (let y = +t; y < +t + +h; y += s) {
  let row = String(y).padStart(4) + ' ';
  for (let x = +l; x < +l + +w; x += s) {
    const v = data[y * info.width + x];
    row += v < 100 ? '#' : v < 200 ? '+' : '.';
  }
  console.log(row);
}
let hdr = '     ';
for (let x = +l; x < +l + +w; x += s) hdr += x % 20 < s ? '|' : ' ';
console.log(hdr);

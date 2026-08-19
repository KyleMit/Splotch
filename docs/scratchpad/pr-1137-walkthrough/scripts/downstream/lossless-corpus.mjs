import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { globSync } from 'node:fs';

const files = globSync('web/static/coloring/*/*.outline.webp');
let onDisk = 0,
  q92 = 0,
  q95 = 0,
  q98 = 0,
  lossless = 0;
for (const f of files) {
  const src = await sharp(f).png().toBuffer();
  onDisk += (await readFile(f)).length;
  q92 += (await sharp(src).webp({ quality: 92 }).toBuffer()).length;
  q95 += (await sharp(src).webp({ quality: 95 }).toBuffer()).length;
  q98 += (await sharp(src).webp({ quality: 98 }).toBuffer()).length;
  lossless += (await sharp(src).webp({ lossless: true, effort: 6 }).toBuffer()).length;
}
const mb = (b) => (b / 1024 / 1024).toFixed(2);
console.log(`${files.length} pen outlines (real, antialiased)`);
console.log(`  on disk today : ${mb(onDisk)} MB`);
console.log(`  q92           : ${mb(q92)} MB`);
console.log(
  `  q95           : ${mb(q95)} MB  (+${(((q95 - q92) / q92) * 100).toFixed(1)}% vs q92)`
);
console.log(
  `  q98           : ${mb(q98)} MB  (+${(((q98 - q92) / q92) * 100).toFixed(1)}% vs q92)`
);
console.log(
  `  LOSSLESS      : ${mb(lossless)} MB  (${(((lossless - q92) / q92) * 100).toFixed(1)}% vs q92)`
);

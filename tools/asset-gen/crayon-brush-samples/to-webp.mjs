// Downsize the raw Gemini JPGs to committed-friendly webp: max 1024px wide,
// quality 80. Reference art doesn't need the full 1408px/750KB originals.
import { readdir, unlink } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../artifacts/crayon-brush-samples'
);
const jpgs = (await readdir(OUT)).filter((f) => /\.jpe?g$/i.test(f));

for (const f of jpgs) {
  const src = join(OUT, f);
  const dst = join(OUT, f.replace(extname(f), '.webp'));
  await sharp(src)
    .resize({ width: 1024, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(dst);
  await unlink(src);
  console.log(`${f} -> ${f.replace(extname(f), '.webp')}`);
}
console.log(`\nConverted ${jpgs.length} images to webp.`);

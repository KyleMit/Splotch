// TEMP (idea-6 experiment): dump eye-core info for a page and save eye-region
// crops of the pen outline + light raw + shipped light fill. Delete after use.
//   node tools/asset-gen/inspect-idea6.mjs objects/teddy-tall /out/dir before
import { readFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { COLORING_DIR, FILL_SRC_DIR } from './lib/paths.mjs';
import { findEyeCores, scoreEyeFill, judgeLightEyes, scoreEyeRings } from './lib/eye-fill.mjs';
import { scoreSolidity } from './lib/solid-regions.mjs';

const [page, outDir, tag] = process.argv.slice(2);
const penPath = join(COLORING_DIR, `${page}.outline.webp`);
const rawPath = join(FILL_SRC_DIR, `${page}.light.raw.webp`);
const shippedPath = join(COLORING_DIR, `${page}.light.webp`);

const pen = await readFile(penPath);
const { width, height } = await sharp(pen).metadata();
const solidity = await scoreSolidity(pen);
const rings = await scoreEyeRings(pen);
const { cores } = await findEyeCores(pen);
console.log(
  `${page}: ${width}x${height}  blob=${solidity.biggestBlob} interior=${solidity.interiorPx ?? '?'} solidityPass=${solidity.passes} ringDepth=${rings.maxDepth}`
);
console.log(`pen eye cores: ${cores.length}`);
for (const c of cores) {
  console.log(
    `  core @ (${Math.round((c.minX + c.maxX) / 2)},${Math.round((c.minY + c.maxY) / 2)}) area=${c.area} bbox=[${c.minX},${c.minY}..${c.maxX},${c.maxY}]`
  );
}

if (existsSync(rawPath)) {
  const raw = await readFile(rawPath);
  const scored = await scoreEyeFill(raw, pen);
  console.log(
    `light raw scored cores: ${scored.cores.length}, lively=${scored.cores.filter((c) => c.lively).length}, judgeLightEyes passes=${judgeLightEyes(scored).passes}`
  );
  for (const c of scored.cores) {
    console.log(
      `  @ (${c.x},${c.y}) coreLuma=${c.coreLuma?.toFixed(0)} bandDark=${c.bandDark?.toFixed(0)} bandLight=${c.bandLight?.toFixed(0)} lively=${c.lively}`
    );
  }
}

if (outDir) {
  await mkdir(outDir, { recursive: true });
  // Crop a box around the given center; save downscaled (long side <= 560).
  const crop = async (srcPath, cx, cy, half, name) => {
    if (!existsSync(srcPath)) return;
    const left = Math.max(0, Math.min(width - 2 * half, cx - half));
    const top = Math.max(0, Math.min(height - 2 * half, cy - half));
    const buf = await sharp(await readFile(srcPath))
      .extract({
        left,
        top,
        width: Math.min(2 * half, width - left),
        height: Math.min(2 * half, height - top),
      })
      .resize({ width: 560, height: 560, fit: 'inside', withoutEnlargement: false })
      .webp({ quality: 88 })
      .toBuffer();
    await sharp(buf).toFile(join(outDir, name));
    console.log(`wrote ${join(outDir, name)}`);
  };
  // center: mean of eye cores if any, else page center
  let cx = Math.round(width / 2),
    cy = Math.round(height / 2);
  if (cores.length) {
    cx = Math.round(cores.reduce((s, c) => s + (c.minX + c.maxX) / 2, 0) / cores.length);
    cy = Math.round(cores.reduce((s, c) => s + (c.minY + c.maxY) / 2, 0) / cores.length);
  }
  const base = page.replace('/', '-');
  await crop(penPath, cx, cy, 180, `${base}.pen-eyes.${tag}.webp`);
  await crop(rawPath, cx, cy, 180, `${base}.lightraw-eyes.${tag}.webp`);
  await crop(shippedPath, cx, cy, 180, `${base}.shipped-light-eyes.${tag}.webp`);
}

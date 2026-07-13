// Convert all PNGs under web/static/ to WebP, written alongside the original.
// Usage:  node tools/asset-gen/scripts/png-to-webp.mjs            (lossy, quality 80)
//         QUALITY=90 node tools/asset-gen/scripts/png-to-webp.mjs (override quality)
//         LOSSLESS=1 node tools/asset-gen/scripts/png-to-webp.mjs (lossless — better for flat line art)
import { globSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { WEB_STATIC } from '../lib/paths.mjs';

const quality = Number(process.env.QUALITY ?? 80);
const lossless = process.env.LOSSLESS === '1';

// Forward-slash glob against a resolved cwd so it works regardless of the launch
// directory and stays cross-platform (ADR-0017).
const files = globSync('**/*.png', { cwd: WEB_STATIC }).map((f) => join(WEB_STATIC, f));
if (files.length === 0) {
  console.log('No PNGs found under web/static/');
  process.exit(0);
}

let savedTotal = 0;
await Promise.all(
  files.map(async (src) => {
    const out = src.replace(/\.png$/i, '.webp');
    const before = (await stat(src)).size;
    await sharp(src)
      .webp(lossless ? { lossless: true } : { quality })
      .toFile(out);
    const after = (await stat(out)).size;
    savedTotal += before - after;
    const pct = (((before - after) / before) * 100).toFixed(0);
    console.log(
      `${src}  ${(before / 1024).toFixed(0)}K -> ${(after / 1024).toFixed(0)}K  (-${pct}%)`
    );
  })
);
console.log(
  `\nTotal saved: ${(savedTotal / 1024 / 1024).toFixed(2)} MB across ${files.length} files`
);

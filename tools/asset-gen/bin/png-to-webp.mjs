// Convert all PNGs under web/static/ to WebP, written alongside the original.
// Usage: node tools/asset-gen/bin/png-to-webp.mjs [--quality <number>] [--lossless]
// Defaults to lossy quality 80. For compatibility, QUALITY and LOSSLESS=1 are
// fallbacks when the corresponding flag is omitted.
import { globSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { parseNonNegative } from '../lib/cli.mjs';
import { WEB_STATIC } from '../lib/paths.mjs';

const { values } = parseArgs({
  options: {
    quality: { type: 'string' },
    lossless: { type: 'boolean' },
  },
});
const quality = parseNonNegative(values.quality ?? process.env.QUALITY, '--quality', 80);
const lossless = values.lossless ?? process.env.LOSSLESS === '1';

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

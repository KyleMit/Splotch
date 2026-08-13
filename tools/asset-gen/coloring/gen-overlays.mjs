import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { globSync } from 'node:fs';
import sharp from 'sharp';
import { fail } from '../lib/asset-cli.mjs';
import { COLORING_DIR } from '../lib/asset-paths.mjs';
import {
  alphaOverlayRgba,
  maxCompositeChannelError,
  OVERLAY_MAX_CHANNEL_ERROR,
} from '../lib/overlay-alpha.mjs';

const OUTLINE_SUFFIX = '.outline.webp';
const CHALK_SUFFIX = '.chalk.webp';
const LIGHT_OVERLAY_SUFFIX = '.overlay.webp';
const DARK_OVERLAY_SUFFIX = '.dark.overlay.webp';
const WEBP_EFFORT = 6;
const BLACK_INK = 0;
const WHITE_INK = 255;

function overlayTarget(source, suffix) {
  return source.slice(0, -OUTLINE_SUFFIX.length) + suffix;
}

async function writeOverlay(source, target, ink) {
  const { data: luma, info } = await sharp(source)
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = alphaOverlayRgba(luma, ink);
  await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .webp({ lossless: true, effort: WEBP_EFFORT })
    .toFile(target);

  const metadata = await sharp(target).metadata();
  if (!metadata.hasAlpha) fail(`[gen:coloring-overlays] ${target} lost its alpha channel.`);
  const decoded = await sharp(target).ensureAlpha().raw().toBuffer();
  const error = maxCompositeChannelError(luma, decoded);
  if (error > OVERLAY_MAX_CHANNEL_ERROR) {
    fail(
      `[gen:coloring-overlays] ${target} changed its source composite by ${error}/255 ` +
        `(limit ${OVERLAY_MAX_CHANNEL_ERROR}/255).`
    );
  }
  return (await stat(target)).size;
}

const filter = process.argv.slice(2);
const directories = filter.length
  ? filter
  : (await readdir(COLORING_DIR, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
const outlines = directories.flatMap((directory) =>
  globSync(join(COLORING_DIR, directory, `*-${'{tall,wide}'}${OUTLINE_SUFFIX}`))
);

if (outlines.length === 0) {
  fail(
    `No page outlines found under ${COLORING_DIR}${filter.length ? ` for: ${filter.join(', ')}` : ''}.`
  );
}

let outputBytes = 0;
for (const outline of outlines) {
  const chalk = outline.slice(0, -OUTLINE_SUFFIX.length) + CHALK_SUFFIX;
  const darkSource = existsSync(chalk) ? chalk : outline;
  outputBytes += await writeOverlay(
    outline,
    overlayTarget(outline, LIGHT_OVERLAY_SUFFIX),
    BLACK_INK
  );
  outputBytes += await writeOverlay(
    darkSource,
    overlayTarget(outline, DARK_OVERLAY_SUFFIX),
    WHITE_INK
  );
  console.log(`[gen:coloring-overlays] wrote ${basename(outline, OUTLINE_SUFFIX)} overlays`);
}

console.log(
  `[gen:coloring-overlays] wrote ${outlines.length * 2} alpha overlay(s), ` +
    `${(outputBytes / 1048576).toFixed(2)} MB total.`
);

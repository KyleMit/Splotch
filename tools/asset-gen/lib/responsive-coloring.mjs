import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';

const WEBP_EFFORT = 6;
const FILL_QUALITY = 85;
const THUMBNAIL_QUALITY = 80;
const RESPONSIVE_GENERATION_CONCURRENCY = 4;
export const RESPONSIVE_MIN_TOTAL_SAVINGS_FRACTION = 0.2;

function isSvgRaster(asset) {
  return asset.encoding === 'selector';
}

function staticAssetPath(staticDir, url) {
  return join(staticDir, url);
}

async function renderDeterministicColoringSvg(sourcePath, asset) {
  const fitTo =
    asset.widthPx < asset.maxEdgePx
      ? { mode: 'height', value: asset.maxEdgePx }
      : { mode: 'width', value: asset.maxEdgePx };
  const rendered = new Resvg(await readFile(sourcePath), {
    fitTo,
    shapeRendering: 2,
    imageRendering: 1,
    font: { loadSystemFonts: false },
  }).render();
  if (
    rendered.width !== asset.widthPx ||
    Math.max(rendered.width, rendered.height) !== asset.maxEdgePx
  ) {
    throw new Error(
      `${asset.source} rendered at ${rendered.width}x${rendered.height}; ` +
        `expected width ${asset.widthPx}px and max edge ${asset.maxEdgePx}px.`
    );
  }
  return rendered;
}

export async function renderResponsiveColoringAsset(sourcePath, asset) {
  if (isSvgRaster(asset)) {
    const rendered = await renderDeterministicColoringSvg(sourcePath, asset);
    return sharp(Buffer.from(rendered.pixels), {
      raw: { width: rendered.width, height: rendered.height, channels: 4 },
    })
      .webp({ lossless: true, exact: true, effort: WEBP_EFFORT })
      .toBuffer();
  }
  const pipeline = sharp(sourcePath).resize(asset.maxEdgePx, asset.maxEdgePx, {
    fit: 'inside',
    kernel: 'lanczos3',
    withoutEnlargement: true,
  });
  return pipeline
    .webp({
      quality: asset.encoding === 'fill' ? FILL_QUALITY : THUMBNAIL_QUALITY,
      effort: WEBP_EFFORT,
    })
    .toBuffer();
}

// Renders and checks one derivative in memory. Nothing touches a tracked target
// until every derivative in the run has passed, so a rejected run leaves the
// committed tier exactly as it was rather than half-regenerated.
async function renderCheckedResponsiveColoringAsset(staticDir, asset) {
  const sourcePath = staticAssetPath(staticDir, asset.source);
  const sourceMetadata = await sharp(sourcePath).metadata();
  const output = await renderResponsiveColoringAsset(sourcePath, asset);

  const metadata = await sharp(output).metadata();
  const actualMaxEdgePx = Math.max(metadata.width ?? 0, metadata.height ?? 0);
  if (metadata.width !== asset.widthPx || actualMaxEdgePx !== asset.maxEdgePx) {
    throw new Error(
      `${asset.target} generated at ${metadata.width}x${metadata.height}; ` +
        `expected width ${asset.widthPx}px and max edge ${asset.maxEdgePx}px.`
    );
  }
  if (sourceMetadata.hasAlpha && !metadata.hasAlpha) {
    throw new Error(`${asset.target} lost the source alpha channel.`);
  }
  const sourceBytes = (await stat(sourcePath)).size;
  if (output.length >= sourceBytes) {
    throw new Error(
      `${asset.target} is ${output.length} bytes, not smaller than its ${sourceBytes}-byte source.`
    );
  }
  return {
    encoding: asset.encoding,
    targetPath: staticAssetPath(staticDir, asset.target),
    output,
    sourceBytes,
    outputBytes: output.length,
  };
}

export function responsiveSavingsFraction(sourceBytes, outputBytes) {
  if (sourceBytes <= 0) {
    throw new Error('Responsive compression accounting has no source bytes.');
  }
  return (sourceBytes - outputBytes) / sourceBytes;
}

async function mapWithConcurrency(items, task) {
  const results = new Array(items.length);
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(RESPONSIVE_GENERATION_CONCURRENCY, items.length) }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await task(items[index]);
      }
    })
  );
  return results;
}

export async function generateResponsiveColoringAssets(staticDir, assets) {
  const derivatives = await mapWithConcurrency(assets, (asset) =>
    renderCheckedResponsiveColoringAsset(staticDir, asset)
  );
  let sourceBytes = 0;
  let outputBytes = 0;
  const byEncoding = {};
  for (const derivative of derivatives) {
    sourceBytes += derivative.sourceBytes;
    outputBytes += derivative.outputBytes;
    const totals = (byEncoding[derivative.encoding] ??= {
      count: 0,
      sourceBytes: 0,
      outputBytes: 0,
    });
    totals.count += 1;
    totals.sourceBytes += derivative.sourceBytes;
    totals.outputBytes += derivative.outputBytes;
  }
  const savingsFraction = responsiveSavingsFraction(sourceBytes, outputBytes);
  if (savingsFraction < RESPONSIVE_MIN_TOTAL_SAVINGS_FRACTION) {
    throw new Error(
      `Responsive tier saved only ${(savingsFraction * 100).toFixed(1)}%; ` +
        `minimum is ${RESPONSIVE_MIN_TOTAL_SAVINGS_FRACTION * 100}%.`
    );
  }
  await mapWithConcurrency(derivatives, async ({ targetPath, output }) => {
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, output);
  });
  return { count: assets.length, sourceBytes, outputBytes, byEncoding };
}

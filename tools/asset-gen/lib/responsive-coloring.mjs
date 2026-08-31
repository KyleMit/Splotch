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

async function generateResponsiveColoringAsset(staticDir, asset) {
  const sourcePath = staticAssetPath(staticDir, asset.source);
  const targetPath = staticAssetPath(staticDir, asset.target);
  const sourceMetadata = await sharp(sourcePath).metadata();
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, await renderResponsiveColoringAsset(sourcePath, asset));

  const metadata = await sharp(targetPath).metadata();
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
  const outputBytes = (await stat(targetPath)).size;
  if (outputBytes >= sourceBytes) {
    throw new Error(
      `${asset.target} is ${outputBytes} bytes, not smaller than its ${sourceBytes}-byte source.`
    );
  }
  return {
    encoding: asset.encoding,
    sourceBytes,
    outputBytes,
    compressionSourceBytes: sourceBytes,
    compressionOutputBytes: outputBytes,
  };
}

export function responsiveSavingsFraction(sourceBytes, outputBytes) {
  if (sourceBytes <= 0) {
    throw new Error('Responsive compression accounting has no source bytes.');
  }
  return (sourceBytes - outputBytes) / sourceBytes;
}

export async function generateResponsiveColoringAssets(staticDir, assets) {
  let sourceBytes = 0;
  let outputBytes = 0;
  let compressionSourceBytes = 0;
  let compressionOutputBytes = 0;
  const byEncoding = {};
  const generatedAssets = new Array(assets.length);
  let nextAssetIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(RESPONSIVE_GENERATION_CONCURRENCY, assets.length) }, async () => {
      while (nextAssetIndex < assets.length) {
        const assetIndex = nextAssetIndex;
        nextAssetIndex += 1;
        generatedAssets[assetIndex] = await generateResponsiveColoringAsset(
          staticDir,
          assets[assetIndex]
        );
      }
    })
  );
  for (const generated of generatedAssets) {
    sourceBytes += generated.sourceBytes;
    outputBytes += generated.outputBytes;
    compressionSourceBytes += generated.compressionSourceBytes;
    compressionOutputBytes += generated.compressionOutputBytes;
    const totals = (byEncoding[generated.encoding] ??= {
      count: 0,
      sourceBytes: 0,
      outputBytes: 0,
    });
    totals.count += 1;
    totals.sourceBytes += generated.sourceBytes;
    totals.outputBytes += generated.outputBytes;
  }
  const savingsFraction = responsiveSavingsFraction(compressionSourceBytes, compressionOutputBytes);
  if (savingsFraction < RESPONSIVE_MIN_TOTAL_SAVINGS_FRACTION) {
    throw new Error(
      `Responsive tier saved only ${(savingsFraction * 100).toFixed(1)}%; ` +
        `minimum is ${RESPONSIVE_MIN_TOTAL_SAVINGS_FRACTION * 100}%.`
    );
  }
  return {
    count: assets.length,
    sourceBytes,
    outputBytes,
    compressionSourceBytes,
    compressionOutputBytes,
    byEncoding,
  };
}

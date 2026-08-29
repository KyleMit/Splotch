import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const WEBP_EFFORT = 6;
const FILL_QUALITY = 85;
const THUMBNAIL_QUALITY = 80;
const RESPONSIVE_GENERATION_CONCURRENCY = 4;
export const RESPONSIVE_MIN_TOTAL_SAVINGS_FRACTION = 0.2;

function staticAssetPath(staticDir, url) {
  return join(staticDir, url);
}

export async function renderResponsiveColoringAsset(sourcePath, asset) {
  const pipeline = sharp(sourcePath).resize(asset.maxEdgePx, asset.maxEdgePx, {
    fit: 'inside',
    kernel: 'lanczos3',
    withoutEnlargement: true,
  });
  return pipeline
    .webp(
      asset.encoding === 'presentation'
        ? { lossless: true, nearLossless: true, quality: 100, effort: WEBP_EFFORT }
        : {
            quality: asset.encoding === 'fill' ? FILL_QUALITY : THUMBNAIL_QUALITY,
            effort: WEBP_EFFORT,
          }
    )
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
  if (asset.encoding !== 'presentation' && outputBytes >= sourceBytes) {
    throw new Error(
      `${asset.target} is ${outputBytes} bytes, not smaller than its ${sourceBytes}-byte source.`
    );
  }
  return {
    sourceBytes,
    outputBytes,
    compressionSourceBytes: asset.encoding === 'presentation' ? 0 : sourceBytes,
    compressionOutputBytes: asset.encoding === 'presentation' ? 0 : outputBytes,
  };
}

export async function generateResponsiveColoringAssets(staticDir, assets) {
  let sourceBytes = 0;
  let outputBytes = 0;
  let compressionSourceBytes = 0;
  let compressionOutputBytes = 0;
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
  }
  const savingsFraction =
    (compressionSourceBytes - compressionOutputBytes) / compressionSourceBytes;
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
  };
}

import { createHash } from 'node:crypto';
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
  return asset.encoding === 'selector' || asset.encoding === 'presentation';
}

// A presentation tier trades bytes for raster time: it is larger than the SVG
// it was rendered from by design, so it is outside the size and savings rules
// that govern the compression derivatives.
function isCompressionDerivative(asset) {
  return asset.encoding !== 'presentation';
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
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
  const compression = isCompressionDerivative(asset);
  if (compression && outputBytes >= sourceBytes) {
    throw new Error(
      `${asset.target} is ${outputBytes} bytes, not smaller than its ${sourceBytes}-byte source.`
    );
  }
  return {
    encoding: asset.encoding,
    sourceBytes,
    outputBytes,
    compressionSourceBytes: compression ? sourceBytes : 0,
    compressionOutputBytes: compression ? outputBytes : 0,
  };
}

/**
 * The sidecar that binds every presentation raster to the SVG it was rendered
 * from, keyed by the source's repo-relative static path: a re-trace changes
 * the SVG digest, and the catalog test then fails on the stale raster instead
 * of shipping it. Filtered generator runs merge into the existing record.
 */
export async function recordPresentationSources(staticDir, assets, sidecarPath) {
  const record = JSON.parse(await readFile(sidecarPath, 'utf8').catch(() => '{}'));
  for (const asset of assets) {
    if (asset.encoding !== 'presentation') continue;
    const entry = (record[asset.source] ??= { sourceSha256: '', rasters: {} });
    entry.sourceSha256 = sha256(await readFile(staticAssetPath(staticDir, asset.source)));
    entry.rasters[asset.target] = sha256(await readFile(staticAssetPath(staticDir, asset.target)));
  }
  const sorted = Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((source) => [
        source,
        {
          sourceSha256: record[source].sourceSha256,
          rasters: Object.fromEntries(
            Object.entries(record[source].rasters).sort(([a], [b]) => (a < b ? -1 : 1))
          ),
        },
      ])
  );
  await mkdir(dirname(sidecarPath), { recursive: true });
  await writeFile(sidecarPath, `${JSON.stringify(sorted, null, 2)}\n`);
  return sorted;
}

/** Every presentation raster whose recorded source or output digest no longer matches disk. */
export async function stalePresentationRasters(staticDir, assets, sidecarPath) {
  const record = JSON.parse(await readFile(sidecarPath, 'utf8').catch(() => '{}'));
  const stale = [];
  for (const asset of assets) {
    if (asset.encoding !== 'presentation') continue;
    const entry = record[asset.source];
    const recorded = entry?.rasters?.[asset.target];
    if (!recorded) {
      stale.push({ target: asset.target, reason: 'unrecorded' });
      continue;
    }
    if (entry.sourceSha256 !== sha256(await readFile(staticAssetPath(staticDir, asset.source)))) {
      stale.push({ target: asset.target, reason: 'source changed' });
      continue;
    }
    const current = await readFile(staticAssetPath(staticDir, asset.target)).catch(() => null);
    if (!current || sha256(current) !== recorded) {
      stale.push({ target: asset.target, reason: current ? 'raster changed' : 'missing' });
    }
  }
  return stale;
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

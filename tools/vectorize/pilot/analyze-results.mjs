import { readFile, stat, writeFile } from 'node:fs/promises';
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib';
import sharp from 'sharp';
import { isMain, runMain } from '../../lib/proc.mjs';

const ROOT = new URL('../../../', import.meta.url).pathname;
const PILOT = new URL('./', import.meta.url).pathname;
const GENERATED = `${ROOT}vectorized/pilot/`;

const specs = [
  {
    name: 'farm-cover',
    source: 'web/static/coloring/farm/cover.outline.webp',
    vector: 'tools/vectorize/pilot/farm-cover.optimized.svg',
    displayAssets: [
      'web/static/coloring/farm/cover.thumb.webp',
      'web/static/coloring/max-240px/farm/cover.thumb.webp',
    ],
    ink: 0,
  },
  {
    name: 'circle-tall-pen',
    source: 'web/static/coloring/shapes/circle-tall.outline.webp',
    reference: 'web/static/coloring/shapes/circle-tall.overlay.webp',
    fill: 'web/static/coloring/shapes/circle-tall.light.webp',
    vector: 'tools/vectorize/pilot/circle-tall-pen.optimized.svg',
    displayAssets: [
      'web/static/coloring/shapes/circle-tall.overlay.webp',
      'web/static/coloring/max-1152px/shapes/circle-tall.overlay.webp',
    ],
    ink: 0,
  },
  {
    name: 'owl-tall-pen',
    source: 'web/static/coloring/creatures/owl-tall.outline.webp',
    reference: 'web/static/coloring/creatures/owl-tall.overlay.webp',
    fill: 'web/static/coloring/creatures/owl-tall.light.webp',
    vector: 'tools/vectorize/pilot/owl-tall-pen.optimized.svg',
    displayAssets: [
      'web/static/coloring/creatures/owl-tall.overlay.webp',
      'web/static/coloring/max-1152px/creatures/owl-tall.overlay.webp',
    ],
    ink: 0,
  },
  {
    name: 'fairy-wide-pen',
    source: 'web/static/coloring/creatures/fairy-wide.outline.webp',
    reference: 'web/static/coloring/creatures/fairy-wide.overlay.webp',
    fill: 'web/static/coloring/creatures/fairy-wide.light.webp',
    vector: 'web/static/coloring/creatures/fairy-wide.overlay.svg',
    displayAssets: [
      'web/static/coloring/creatures/fairy-wide.overlay.webp',
      'web/static/coloring/max-1152px/creatures/fairy-wide.overlay.webp',
    ],
    ink: 0,
  },
  {
    name: 'owl-tall-chalk',
    source: 'web/static/coloring/creatures/owl-tall.chalk.webp',
    reference: 'web/static/coloring/creatures/owl-tall.dark.overlay.webp',
    fill: 'web/static/coloring/creatures/owl-tall.night.webp',
    vector: 'tools/vectorize/pilot/owl-tall-chalk.optimized.svg',
    displayAssets: [
      'web/static/coloring/creatures/owl-tall.dark.overlay.webp',
      'web/static/coloring/max-1152px/creatures/owl-tall.dark.overlay.webp',
    ],
    ink: 255,
  },
];

function path(relative) {
  return `${ROOT}${relative}`;
}

async function sourceAlpha(source, width, height) {
  const luma = await sharp(path(source))
    .resize(width, height, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer();
  return Uint8Array.from(luma, (value) => 255 - value);
}

async function imageAlpha(image, width, height) {
  const rgba = await sharp(path(image))
    .resize(width, height, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i += 1) alpha[i] = rgba[i * 4 + 3];
  return alpha;
}

async function vectorAlpha(vector, width, height) {
  const rgba = await sharp(path(vector), { density: 192 })
    .resize(width, height, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i += 1) alpha[i] = rgba[i * 4 + 3];
  return alpha;
}

function compareAlpha(reference, candidate) {
  let absoluteError = 0;
  let maximumError = 0;
  let over4 = 0;
  let over16 = 0;
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  for (let i = 0; i < reference.length; i += 1) {
    const error = Math.abs(reference[i] - candidate[i]);
    absoluteError += error;
    maximumError = Math.max(maximumError, error);
    if (error > 4) over4 += 1;
    if (error > 16) over16 += 1;
    const referenceInk = reference[i] >= 128;
    const candidateInk = candidate[i] >= 128;
    if (referenceInk && candidateInk) truePositive += 1;
    else if (!referenceInk && candidateInk) falsePositive += 1;
    else if (referenceInk) falseNegative += 1;
  }
  return {
    meanAbsoluteError: absoluteError / reference.length,
    maximumError,
    pixelsOver4Fraction: over4 / reference.length,
    pixelsOver16Fraction: over16 / reference.length,
    binaryPrecision: truePositive / (truePositive + falsePositive),
    binaryRecall: truePositive / (truePositive + falseNegative),
    binaryIou: truePositive / (truePositive + falsePositive + falseNegative),
  };
}

async function backgroundRgba(spec, width, height) {
  if (!spec.fill) {
    return Buffer.alloc(width * height * 4, 255);
  }
  return sharp(path(spec.fill))
    .resize(width, height, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer();
}

function composite(background, alpha, ink) {
  const output = Buffer.alloc(background.length);
  for (let i = 0; i < alpha.length; i += 1) {
    const amount = alpha[i] / 255;
    for (let channel = 0; channel < 3; channel += 1) {
      output[i * 4 + channel] = Math.round(
        ink * amount + background[i * 4 + channel] * (1 - amount)
      );
    }
    output[i * 4 + 3] = 255;
  }
  return output;
}

function compositeDifference(reference, candidate) {
  let sum = 0;
  let maximum = 0;
  let over4 = 0;
  let over16 = 0;
  const pixels = reference.length / 4;
  for (let i = 0; i < reference.length; i += 4) {
    let pixelMaximum = 0;
    for (let channel = 0; channel < 3; channel += 1) {
      const error = Math.abs(reference[i + channel] - candidate[i + channel]);
      sum += error;
      maximum = Math.max(maximum, error);
      pixelMaximum = Math.max(pixelMaximum, error);
    }
    if (pixelMaximum > 4) over4 += 1;
    if (pixelMaximum > 16) over16 += 1;
  }
  return {
    meanAbsoluteChannelError: sum / (pixels * 3),
    maximumChannelError: maximum,
    pixelsOver4Fraction: over4 / pixels,
    pixelsOver16Fraction: over16 / pixels,
  };
}

async function comparisonSheet(spec, currentComposite, vectorComposite, width, height) {
  const targetWidth = 320;
  const targetHeight = Math.round((height / width) * targetWidth);
  const current = await sharp(currentComposite, { raw: { width, height, channels: 4 } })
    .resize(targetWidth, targetHeight)
    .png()
    .toBuffer();
  const vector = await sharp(vectorComposite, { raw: { width, height, channels: 4 } })
    .resize(targetWidth, targetHeight)
    .png()
    .toBuffer();
  const difference = Buffer.alloc(currentComposite.length);
  for (let i = 0; i < currentComposite.length; i += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      difference[i + channel] = Math.min(
        255,
        Math.abs(currentComposite[i + channel] - vectorComposite[i + channel]) * 8
      );
    }
    difference[i + 3] = 255;
  }
  const diff = await sharp(difference, { raw: { width, height, channels: 4 } })
    .resize(targetWidth, targetHeight)
    .png()
    .toBuffer();
  const labelHeight = 28;
  const label = (text) =>
    Buffer.from(
      `<svg width="${targetWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#ffffff"/><text x="8" y="20" font-family="sans-serif" font-size="16" fill="#111111">${text}</text></svg>`
    );
  const panel = async (image, text) =>
    sharp({
      create: {
        width: targetWidth,
        height: targetHeight + labelHeight,
        channels: 4,
        background: '#ffffff',
      },
    })
      .composite([
        { input: label(text), top: 0, left: 0 },
        { input: image, top: labelHeight, left: 0 },
      ])
      .png()
      .toBuffer();
  const panels = await Promise.all([
    panel(current, 'Current WebP'),
    panel(vector, 'Vector SVG'),
    panel(diff, 'Difference ×8'),
  ]);
  await sharp({
    create: {
      width: targetWidth * 3,
      height: targetHeight + labelHeight,
      channels: 4,
      background: '#ffffff',
    },
  })
    .composite(panels.map((input, index) => ({ input, top: 0, left: index * targetWidth })))
    .png()
    .toFile(`${GENERATED}${spec.name}.comparison.png`);
}

async function zoomComparisonSheet(spec, width, height) {
  if (!spec.reference) return;
  const scale = 2;
  const renderWidth = width * scale;
  const renderHeight = height * scale;
  const referenceAlpha = await imageAlpha(spec.reference, renderWidth, renderHeight);
  const candidateAlpha = await vectorAlpha(spec.vector, renderWidth, renderHeight);
  const background = await backgroundRgba(spec, renderWidth, renderHeight);
  const current = composite(background, referenceAlpha, spec.ink);
  const vector = composite(background, candidateAlpha, spec.ink);
  const crop = {
    left: Math.round(width * 0.27 * scale),
    top: Math.round(height * 0.27 * scale),
    width: Math.round(width * 0.46 * scale),
    height: Math.round(width * 0.46 * scale),
  };
  const cropImage = (input) =>
    sharp(input, {
      raw: { width: renderWidth, height: renderHeight, channels: 4 },
    })
      .extract(crop)
      .png()
      .toBuffer();
  const currentCrop = await cropImage(current);
  const vectorCrop = await cropImage(vector);
  const difference = Buffer.alloc(current.length);
  for (let i = 0; i < current.length; i += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      difference[i + channel] = Math.min(
        255,
        Math.abs(current[i + channel] - vector[i + channel]) * 8
      );
    }
    difference[i + 3] = 255;
  }
  const differenceCrop = await cropImage(difference);
  await sharp({
    create: { width: crop.width * 3, height: crop.height, channels: 4, background: '#ffffff' },
  })
    .composite([
      { input: currentCrop, left: 0, top: 0 },
      { input: vectorCrop, left: crop.width, top: 0 },
      { input: differenceCrop, left: crop.width * 2, top: 0 },
    ])
    .png()
    .toFile(`${GENERATED}${spec.name}.zoom-2x.png`);
}

export async function analyzeVectorPilot(onlyNames = []) {
  const selectedSpecs =
    onlyNames.length === 0 ? specs : specs.filter((spec) => onlyNames.includes(spec.name));
  if (selectedSpecs.length !== (onlyNames.length || specs.length)) {
    throw new Error(
      `Unknown pilot sample; available samples: ${specs.map((spec) => spec.name).join(', ')}`
    );
  }
  const report = [];
  for (const spec of selectedSpecs) {
    const metadata = await sharp(path(spec.source)).metadata();
    const width = metadata.width;
    const height = metadata.height;
    const svg = await readFile(path(spec.vector));
    const referenceAlpha = spec.reference
      ? await imageAlpha(spec.reference, width, height)
      : await sourceAlpha(spec.source, width, height);
    const candidateAlpha = await vectorAlpha(spec.vector, width, height);
    const background = await backgroundRgba(spec, width, height);
    const currentComposite = composite(background, referenceAlpha, spec.ink);
    const vectorComposite = composite(background, candidateAlpha, spec.ink);
    await comparisonSheet(spec, currentComposite, vectorComposite, width, height);
    await zoomComparisonSheet(spec, width, height);
    report.push({
      name: spec.name,
      dimensions: `${width}x${height}`,
      bytes: {
        source: (await stat(path(spec.source))).size,
        currentDisplayAssets: Object.fromEntries(
          await Promise.all(
            spec.displayAssets.map(async (asset) => [asset, (await stat(path(asset))).size])
          )
        ),
        svg: svg.length,
        svgGzip: gzipSync(svg, { level: 9 }).length,
        svgBrotli: brotliCompressSync(svg, {
          params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
        }).length,
      },
      shapes: [...svg.toString().matchAll(/<(path|rect|circle|ellipse|polygon|polyline|line)\b/g)]
        .length,
      alpha: compareAlpha(referenceAlpha, candidateAlpha),
      composite: compositeDifference(currentComposite, vectorComposite),
    });
  }

  const reportPath =
    onlyNames.length === 0 ? `${PILOT}report.json` : `${GENERATED}campaign-gate-report.json`;
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

if (isMain(import.meta.url)) runMain(() => analyzeVectorPilot(process.argv.slice(2)));

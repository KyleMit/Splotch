// Decode and resize work is shared by every composed night gate. Buffer identity
// keys the fill/source preparation cache, so callers must treat those buffers as
// immutable; failed preparations and size-specific resizes evict their promises
// so a transient Sharp failure does not poison later scoring.
import sharp from 'sharp';

const preparedAnalyses = new WeakSet();
const preparationPromises = new WeakMap();

async function decodeRgb(image) {
  const { data, info } = await image
    .clone()
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { image, rgb: data, width: info.width, height: info.height };
}

async function prepare(fillBuffer, sourceBuffer) {
  const [fill, source] = await Promise.all([
    decodeRgb(sharp(fillBuffer)),
    decodeRgb(sharp(sourceBuffer)),
  ]);
  const analysis = {
    fill,
    source,
    fillRgbAt: new Map(),
    fillLumaAt: new Map(),
    sourceRgbAt: new Map(),
    sourceLumaAt: new Map(),
  };
  preparedAnalyses.add(analysis);
  return analysis;
}

export async function prepareNightAnalysis(fill, source) {
  if (preparedAnalyses.has(fill)) return fill;
  const existing = preparationPromises.get(fill);
  if (existing?.source === source) return existing.promise;
  const promise = prepare(fill, source);
  preparationPromises.set(fill, { source, promise });
  try {
    return await promise;
  } catch (error) {
    preparationPromises.delete(fill);
    throw error;
  }
}

function sizeKey(width, height) {
  return `${width}x${height}`;
}

function resizedRaw(asset, targetWidth, targetHeight, grayscale) {
  let image = asset.image.clone().removeAlpha().resize(targetWidth, targetHeight, { fit: 'fill' });
  if (grayscale) image = image.grayscale();
  return image.raw().toBuffer({ resolveWithObject: true });
}

function cachedResize(cache, key, create) {
  if (cache.has(key)) return cache.get(key);
  const pending = create();
  cache.set(key, pending);
  pending.catch(() => cache.delete(key));
  return pending;
}

export function fillRgbAt(analysis, width, height) {
  const key = sizeKey(width, height);
  return cachedResize(analysis.fillRgbAt, key, () =>
    resizedRaw(analysis.fill, width, height, false)
  );
}

export function fillLumaAt(analysis, width, height) {
  const key = sizeKey(width, height);
  return cachedResize(analysis.fillLumaAt, key, () =>
    resizedRaw(analysis.fill, width, height, true)
  );
}

export function sourceLumaAt(analysis, width, height) {
  const key = sizeKey(width, height);
  return cachedResize(analysis.sourceLumaAt, key, () =>
    resizedRaw(analysis.source, width, height, true)
  );
}

export function sourceRgbAt(analysis, width, height) {
  const key = sizeKey(width, height);
  return cachedResize(analysis.sourceRgbAt, key, () =>
    resizedRaw(analysis.source, width, height, false)
  );
}

export function isPreparedNightAnalysis(value) {
  return preparedAnalyses.has(value);
}

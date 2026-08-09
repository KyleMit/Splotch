import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const PAGE_INVENTORY_MANIFEST_SCHEMA_VERSION = 1;
export const PAGE_INVENTORY_CRITIQUE_SCHEMA_VERSION = 2;
export const PAGE_INVENTORY_SEVERITIES = ['pass', 'low', 'medium', 'high'];

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ORIENTATIONS = ['portrait', 'landscape'];

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read ${label} at ${path}: ${error.message}`, { cause: error });
  }
}

function requireString(value, location) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${location} must be a string`);
}

function requirePositiveInteger(value, location) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${location} must be a positive integer`);
  }
}

function validateViewport(viewport, location) {
  if (!viewport || typeof viewport !== 'object') throw new Error(`${location} must be an object`);
  for (const field of ['id', 'category', 'device', 'form_factor', 'orientation']) {
    requireString(viewport[field], `${location}.${field}`);
  }
  if (!['phone', 'tablet'].includes(viewport.form_factor)) {
    throw new Error(`${location}.form_factor is invalid: ${viewport.form_factor}`);
  }
  if (!ORIENTATIONS.includes(viewport.orientation)) {
    throw new Error(`${location}.orientation is invalid: ${viewport.orientation}`);
  }
  requirePositiveInteger(viewport.width, `${location}.width`);
  requirePositiveInteger(viewport.height, `${location}.height`);
}

function validateCaptureRecord(record, location, viewports) {
  if (!record || typeof record !== 'object') throw new Error(`${location} must be an object`);
  for (const field of [
    'image',
    'sha256',
    'group',
    'surface_id',
    'surface_title',
    'surface_description',
    'source',
    'viewport_id',
  ]) {
    requireString(record[field], `${location}.${field}`);
  }
  if (!SHA256_PATTERN.test(record.sha256)) {
    throw new Error(`${location}.sha256 must be a lowercase SHA-256 digest`);
  }
  const viewport = viewports.get(record.viewport_id);
  if (!viewport) throw new Error(`${location} references unknown viewport ${record.viewport_id}`);
  for (const field of [
    'viewport_label',
    'device',
    'form_factor',
    'orientation',
    'width',
    'height',
  ]) {
    const manifestField = field === 'viewport_label' ? 'category' : field;
    if (record[field] !== viewport[manifestField]) {
      throw new Error(`${location}.${field} disagrees with viewport ${record.viewport_id}`);
    }
  }
}

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function captureRecord(item, viewport, image, sha256) {
  return {
    image,
    sha256,
    group: item.group,
    surface_id: item.id,
    surface_title: item.title,
    surface_description: item.description,
    source: item.source,
    viewport_id: viewport.id,
    viewport_label: viewport.category,
    device: viewport.device,
    form_factor: viewport.formFactor,
    width: viewport.width,
    height: viewport.height,
    orientation: viewport.orientation,
  };
}

export function createCaptureManifest(viewports, captures) {
  const manifest = {
    schema_version: PAGE_INVENTORY_MANIFEST_SCHEMA_VERSION,
    viewports: viewports.map((viewport) => ({
      id: viewport.id,
      category: viewport.category,
      device: viewport.device,
      form_factor: viewport.formFactor,
      width: viewport.width,
      height: viewport.height,
      orientation: viewport.orientation,
    })),
    captures,
  };
  validateCaptureManifest(manifest);
  return manifest;
}

export function readCaptureManifest(path) {
  const manifest = readJson(path, 'page inventory capture manifest');
  validateCaptureManifest(manifest);
  return manifest;
}

export function validateCaptureManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Page inventory capture manifest must be an object');
  }
  if (manifest.schema_version !== PAGE_INVENTORY_MANIFEST_SCHEMA_VERSION) {
    throw new Error(
      `Page inventory capture manifest schema_version must be ${PAGE_INVENTORY_MANIFEST_SCHEMA_VERSION}`
    );
  }
  if (!Array.isArray(manifest.viewports) || !manifest.viewports.length) {
    throw new Error('Page inventory capture manifest must contain viewports');
  }
  if (!Array.isArray(manifest.captures) || !manifest.captures.length) {
    throw new Error('Page inventory capture manifest must contain captures');
  }
  const viewports = new Map();
  for (const [index, viewport] of manifest.viewports.entries()) {
    const location = `Capture manifest viewport ${index + 1}`;
    validateViewport(viewport, location);
    if (viewports.has(viewport.id)) throw new Error(`${location} duplicates id ${viewport.id}`);
    viewports.set(viewport.id, viewport);
  }
  const images = new Set();
  const surfaceViewports = new Map();
  for (const [index, capture] of manifest.captures.entries()) {
    const location = `Capture manifest entry ${index + 1}`;
    validateCaptureRecord(capture, location, viewports);
    if (images.has(capture.image)) throw new Error(`${location} duplicates image ${capture.image}`);
    images.add(capture.image);
    const surfaceKey = `${capture.group}/${capture.surface_id}`;
    const ids = surfaceViewports.get(surfaceKey) ?? new Set();
    if (ids.has(capture.viewport_id)) {
      throw new Error(`${location} duplicates viewport ${capture.viewport_id} for ${surfaceKey}`);
    }
    ids.add(capture.viewport_id);
    surfaceViewports.set(surfaceKey, ids);
  }
  for (const [surfaceKey, ids] of surfaceViewports) {
    if (ids.size !== viewports.size) {
      throw new Error(
        `Capture manifest surface ${surfaceKey} has ${ids.size} of ${viewports.size} viewports`
      );
    }
    for (const id of viewports.keys()) {
      if (!ids.has(id)) throw new Error(`Capture manifest surface ${surfaceKey} is missing ${id}`);
    }
  }
}

function validateCritiqueEntry(entry, location, capture) {
  if (!entry || typeof entry !== 'object') throw new Error(`${location} must be an object`);
  requireString(entry.image, `${location}.image`);
  requireString(entry.sha256, `${location}.sha256`);
  if (!capture) throw new Error(`${location} references an unknown image: ${entry.image}`);
  if (entry.sha256 !== capture.sha256) {
    throw new Error(`${location} has a stale image hash for ${entry.image}`);
  }
  if (!PAGE_INVENTORY_SEVERITIES.includes(entry.severity)) {
    throw new Error(`${location} has invalid severity: ${entry.severity}`);
  }
  requireString(entry.critique, `${location}.critique`);
  if (entry.severity === 'pass') {
    if (entry.recommendation !== null) {
      throw new Error(`${location} recommendation must be null for pass`);
    }
  } else {
    requireString(entry.recommendation, `${location}.recommendation`);
  }
  if (entry.tags !== undefined) {
    if (!Array.isArray(entry.tags) || entry.tags.some((tag) => typeof tag !== 'string')) {
      throw new Error(`${location}.tags must be an array of strings`);
    }
  }
}

export function validateCritiqueEntries(entries, manifest, { allowPartial = false } = {}) {
  if (!Array.isArray(entries)) throw new Error('Design critique must contain an entries array');
  const captures = new Map(manifest.captures.map((capture) => [capture.image, capture]));
  const validated = new Map();
  for (const [index, entry] of entries.entries()) {
    const location = `Design critique entry ${index + 1}`;
    validateCritiqueEntry(entry, location, captures.get(entry?.image));
    if (validated.has(entry.image)) throw new Error(`${location} duplicates image: ${entry.image}`);
    validated.set(entry.image, entry);
  }
  if (!allowPartial && validated.size !== captures.size) {
    const missing = manifest.captures.find((capture) => !validated.has(capture.image));
    throw new Error(
      `Design critique has ${validated.size} of ${captures.size} required entries${missing ? `; missing ${missing.image}` : ''}`
    );
  }
  return validated;
}

export function readDesignCritique(path, manifest, options) {
  if (!path) return new Map();
  const document = readJson(path, 'design critique');
  if (document.schema_version !== PAGE_INVENTORY_CRITIQUE_SCHEMA_VERSION) {
    throw new Error(
      `Design critique at ${path} schema_version must be ${PAGE_INVENTORY_CRITIQUE_SCHEMA_VERSION}`
    );
  }
  return validateCritiqueEntries(document.entries, manifest, options);
}

export function critiqueBatchKey(capture) {
  return `${capture.group}--${capture.surface_id}--${capture.orientation}`;
}

export function expectedCritiqueBatches(manifest) {
  return Map.groupBy(manifest.captures, critiqueBatchKey);
}

export function finalizeDesignCritique(manifest, entries, { allowPartial = false } = {}) {
  const validated = validateCritiqueEntries(entries, manifest, { allowPartial });
  const orderedEntries = manifest.captures
    .filter((capture) => validated.has(capture.image))
    .map((capture) => ({
      ...capture,
      severity: validated.get(capture.image).severity,
      critique: validated.get(capture.image).critique.trim(),
      recommendation:
        validated.get(capture.image).recommendation === null
          ? null
          : validated.get(capture.image).recommendation.trim(),
      tags: validated.get(capture.image).tags ?? [],
    }));
  const severityCounts = Object.fromEntries(
    PAGE_INVENTORY_SEVERITIES.map((severity) => [
      severity,
      orderedEntries.filter((entry) => entry.severity === severity).length,
    ])
  );
  return {
    schema_version: PAGE_INVENTORY_CRITIQUE_SCHEMA_VERSION,
    report_type: 'responsive-page-inventory-design-critique',
    scope: {
      surfaces_reviewed: new Set(orderedEntries.map((entry) => entry.surface_id)).size,
      screenshots_reviewed: orderedEntries.length,
      expected_screenshots: manifest.captures.length,
      completeness: orderedEntries.length === manifest.captures.length ? 'complete' : 'partial',
      viewports: manifest.viewports,
    },
    summary: { severity_counts: severityCounts },
    entries: orderedEntries,
  };
}

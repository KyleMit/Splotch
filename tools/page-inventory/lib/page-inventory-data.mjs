import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { GENERAL_DESIGN_NOTES, surfaceDesignNote } from './page-inventory-design-notes.mjs';

const PAGE_INVENTORY_MANIFEST_SCHEMA_VERSION = 3;
export const PAGE_INVENTORY_CRITIQUE_SCHEMA_VERSION = 5;
export const PAGE_INVENTORY_REVIEW_CONTRACT = 'isolated-image-description-v1';
export const PAGE_INVENTORY_SEVERITIES = ['pass', 'low', 'medium', 'high'];
export const PAGE_INVENTORY_THEMES = [
  {
    id: 'light',
    label: 'Light mode',
    reviewFocus:
      'Assess visible hierarchy, spacing, text fit, clipping, overlap, touch-target clarity, modal scrolling, and visual consistency.',
  },
  {
    id: 'dark',
    label: 'Night mode',
    reviewFocus:
      'Assess only night-mode contrast and legibility. Ignore layout and responsive composition.',
  },
];

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

function validateTheme(theme, location) {
  if (!theme || typeof theme !== 'object') throw new Error(`${location} must be an object`);
  for (const field of ['id', 'label', 'review_focus']) {
    requireString(theme[field], `${location}.${field}`);
  }
}

function validateCaptureRecord(record, location, viewports, themes) {
  if (!record || typeof record !== 'object') throw new Error(`${location} must be an object`);
  for (const field of [
    'review_id',
    'review_description',
    'image',
    'sha256',
    'group',
    'surface_id',
    'surface_title',
    'surface_description',
    'source',
    'viewport_id',
    'theme',
  ]) {
    requireString(record[field], `${location}.${field}`);
  }
  if (!SHA256_PATTERN.test(record.sha256)) {
    throw new Error(`${location}.sha256 must be a lowercase SHA-256 digest`);
  }
  if (!themes.has(record.theme)) {
    throw new Error(`${location} references unknown theme ${record.theme}`);
  }
  if (record.surface_intent !== undefined) {
    requireString(record.surface_intent, `${location}.surface_intent`);
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

// A reviewer is handed exactly two semantic inputs, so a checkpoint that binds
// only the image is bound to half of what produced it: edit a design note and
// every stored review silently stays current against a description no reviewer
// ever saw. This digest is the other half of that binding.
export function reviewDescriptionDigest(description) {
  return createHash('sha256').update(description).digest('hex');
}

export function captureReviewId(item, viewport, theme) {
  return `${item.group}--${item.id}--${viewport.id}--${theme.id}`;
}

// The framing carries the same obligation as the notes themselves: it may state
// what was decided, never how the image measures up to it. A reviewer told the
// verdict before looking stops assessing, and this sentence reaches the
// night-mode reviewers whose whole remit is contrast and legibility.
const GENERAL_DESIGN_NOTE_BRIEF = `Design decisions already settled for this app, given as context for what you are looking at rather than as a judgement of it: ${GENERAL_DESIGN_NOTES.join(' ')}`;

function captureReviewDescription(item, viewport, theme) {
  const note = surfaceDesignNote(item.group, item.id);
  const intent = note ? ` Design intent: ${note}` : '';
  return `${item.title}. ${item.description}${intent} Captured in ${theme.label.toLowerCase()} on ${viewport.device} in ${viewport.orientation} at ${viewport.width} × ${viewport.height}. ${theme.reviewFocus} ${GENERAL_DESIGN_NOTE_BRIEF} Judge only visible evidence. Use severity pass, low, medium, or high. A pass means there is no actionable visible issue and requires a null recommendation; otherwise give one specific recommendation. Return concise issue-category tags.`;
}

export function captureRecord(item, viewport, theme, image, sha256) {
  const note = surfaceDesignNote(item.group, item.id);
  return {
    review_id: captureReviewId(item, viewport, theme),
    review_description: captureReviewDescription(item, viewport, theme),
    image,
    sha256,
    group: item.group,
    surface_id: item.id,
    surface_title: item.title,
    surface_description: item.description,
    ...(note ? { surface_intent: note } : {}),
    source: item.source,
    viewport_id: viewport.id,
    viewport_label: viewport.category,
    device: viewport.device,
    form_factor: viewport.formFactor,
    width: viewport.width,
    height: viewport.height,
    orientation: viewport.orientation,
    theme: theme.id,
  };
}

export function validateThemeCaptureDifferences(captures, surfaces) {
  const surfaceKeys = new Set(surfaces.map((item) => `${item.group}/${item.id}`));
  const pairs = new Map();
  for (const capture of captures) {
    const surfaceKey = `${capture.group}/${capture.surface_id}`;
    if (!surfaceKeys.has(surfaceKey)) {
      throw new Error(`Capture references unknown surface ${surfaceKey}`);
    }
    const pairKey = `${surfaceKey}/${capture.viewport_id}`;
    const themeCaptures = pairs.get(pairKey) ?? new Map();
    themeCaptures.set(capture.theme, capture);
    pairs.set(pairKey, themeCaptures);
  }
  for (const [pairKey, themeCaptures] of pairs) {
    const light = themeCaptures.get('light');
    const dark = themeCaptures.get('dark');
    if (light && dark && light.sha256 === dark.sha256) {
      throw new Error(`Surface ${pairKey} produced pixel-identical light and night captures`);
    }
  }
}

export function createCaptureManifest(viewports, captures) {
  const manifest = {
    schema_version: PAGE_INVENTORY_MANIFEST_SCHEMA_VERSION,
    themes: PAGE_INVENTORY_THEMES.map((theme) => ({
      id: theme.id,
      label: theme.label,
      review_focus: theme.reviewFocus,
    })),
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

function validateCaptureManifest(manifest) {
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
  if (!Array.isArray(manifest.themes) || !manifest.themes.length) {
    throw new Error('Page inventory capture manifest must contain themes');
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
  const themes = new Map();
  for (const [index, theme] of manifest.themes.entries()) {
    const location = `Capture manifest theme ${index + 1}`;
    validateTheme(theme, location);
    if (themes.has(theme.id)) throw new Error(`${location} duplicates id ${theme.id}`);
    themes.set(theme.id, theme);
  }
  const images = new Set();
  const reviewIds = new Set();
  // An isolated reviewer receives exactly two semantic inputs: the image and
  // the review description. Two captures that share both are the same review
  // twice — one of them buys nothing, and any severity difference between them
  // is reviewer nondeterminism rather than a judgement about a named surface.
  // Divergence across captures that share only pixels is legitimate and is
  // recorded by pixelIdenticalReviewGroups instead.
  const reviewInputs = new Map();
  const surfaceCaptures = new Map();
  for (const [index, capture] of manifest.captures.entries()) {
    const location = `Capture manifest entry ${index + 1}`;
    validateCaptureRecord(capture, location, viewports, themes);
    if (images.has(capture.image)) throw new Error(`${location} duplicates image ${capture.image}`);
    images.add(capture.image);
    if (reviewIds.has(capture.review_id)) {
      throw new Error(`${location} duplicates review_id ${capture.review_id}`);
    }
    reviewIds.add(capture.review_id);
    const reviewInput = `${capture.sha256} ${capture.review_description}`;
    const twinReviewId = reviewInputs.get(reviewInput);
    if (twinReviewId) {
      throw new Error(
        `Capture manifest entries ${twinReviewId} and ${capture.review_id} are indistinguishable reviews: identical pixels and an identical review description`
      );
    }
    reviewInputs.set(reviewInput, capture.review_id);
    const surfaceKey = `${capture.group}/${capture.surface_id}`;
    const ids = surfaceCaptures.get(surfaceKey) ?? new Set();
    const captureKey = `${capture.viewport_id}/${capture.theme}`;
    if (ids.has(captureKey)) {
      throw new Error(`${location} duplicates ${captureKey} for ${surfaceKey}`);
    }
    ids.add(captureKey);
    surfaceCaptures.set(surfaceKey, ids);
  }
  const expectedCaptureCount = viewports.size * themes.size;
  for (const [surfaceKey, ids] of surfaceCaptures) {
    if (ids.size !== expectedCaptureCount) {
      throw new Error(
        `Capture manifest surface ${surfaceKey} has ${ids.size} of ${expectedCaptureCount} viewport-theme captures`
      );
    }
    for (const viewportId of viewports.keys()) {
      for (const themeId of themes.keys()) {
        const captureKey = `${viewportId}/${themeId}`;
        if (!ids.has(captureKey)) {
          throw new Error(`Capture manifest surface ${surfaceKey} is missing ${captureKey}`);
        }
      }
    }
  }
}

export class StaleCritiqueHashError extends Error {}

function validateCritiqueEntry(entry, location, capture) {
  if (!entry || typeof entry !== 'object') throw new Error(`${location} must be an object`);
  requireString(entry.review_id, `${location}.review_id`);
  requireString(entry.image, `${location}.image`);
  requireString(entry.sha256, `${location}.sha256`);
  if (!capture) throw new Error(`${location} references an unknown review_id: ${entry.review_id}`);
  if (entry.image !== capture.image) {
    throw new Error(`${location}.image disagrees with review ${entry.review_id}`);
  }
  if (entry.sha256 !== capture.sha256) {
    throw new StaleCritiqueHashError(`${location} has a stale image hash for ${entry.image}`);
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
  const captures = new Map(manifest.captures.map((capture) => [capture.review_id, capture]));
  const validated = new Map();
  for (const [index, entry] of entries.entries()) {
    const location = `Design critique entry ${index + 1}`;
    validateCritiqueEntry(entry, location, captures.get(entry?.review_id));
    if (validated.has(entry.review_id)) {
      throw new Error(`${location} duplicates review_id: ${entry.review_id}`);
    }
    validated.set(entry.review_id, entry);
  }
  if (!allowPartial && validated.size !== captures.size) {
    const missing = manifest.captures.find((capture) => !validated.has(capture.review_id));
    throw new Error(
      `Design critique has ${validated.size} of ${captures.size} required entries${missing ? `; missing ${missing.review_id}` : ''}`
    );
  }
  return validated;
}

// A surface that renders a shared shell — the wide Settings hub opening on its
// first section, or the compact landscape quick toggles every section collapses
// into — captures byte-identically under more than one name. Each of those is
// still its own review, because the reviewer also read a description naming the
// surface it expected, and the same pixels mean different things against
// different expectations. So the severities are kept apart and the sharing is
// reported rather than reconciled.
export function pixelIdenticalReviewGroups(captures, reviews) {
  const groups = new Map();
  for (const capture of captures) {
    const review = reviews.get(capture.review_id);
    if (!review) continue;
    const groupKey = `${capture.sha256}--${capture.theme}`;
    const group = groups.get(groupKey) ?? {
      sha256: capture.sha256,
      theme: capture.theme,
      reviews: [],
    };
    group.reviews.push({ review_id: capture.review_id, severity: review.severity });
    groups.set(groupKey, group);
  }
  return [...groups.values()]
    .filter((group) => group.reviews.length > 1)
    .map(({ sha256, theme, reviews: grouped }) => ({
      sha256,
      theme,
      divergent: new Set(grouped.map((review) => review.severity)).size > 1,
      reviews: grouped,
    }));
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

export function expectedCritiqueReviews(manifest) {
  return new Map(manifest.captures.map((capture) => [capture.review_id, capture]));
}

// The review contract names a process, not the thing that ran it: two runners
// satisfy it with different models, and their severity distributions are not
// known to be comparable. Recording who reviewed is what lets a later reader
// tell a real change in the app from a change of instrument.
export function finalizeDesignCritique(manifest, entries, { allowPartial = false, reviewer } = {}) {
  const validated = validateCritiqueEntries(entries, manifest, { allowPartial });
  const orderedEntries = manifest.captures
    .filter((capture) => validated.has(capture.review_id))
    .map((capture) => ({
      ...capture,
      severity: validated.get(capture.review_id).severity,
      critique: validated.get(capture.review_id).critique.trim(),
      recommendation:
        validated.get(capture.review_id).recommendation === null
          ? null
          : validated.get(capture.review_id).recommendation.trim(),
      tags: validated.get(capture.review_id).tags ?? [],
    }));
  const severityCounts = Object.fromEntries(
    PAGE_INVENTORY_SEVERITIES.map((severity) => [
      severity,
      orderedEntries.filter((entry) => entry.severity === severity).length,
    ])
  );
  const pixelIdenticalGroups = pixelIdenticalReviewGroups(manifest.captures, validated);
  return {
    schema_version: PAGE_INVENTORY_CRITIQUE_SCHEMA_VERSION,
    report_type: 'light-dark-responsive-page-inventory-design-critique',
    scope: {
      review_contract: PAGE_INVENTORY_REVIEW_CONTRACT,
      reviewer,
      surfaces_reviewed: new Set(orderedEntries.map((entry) => entry.surface_id)).size,
      screenshots_reviewed: orderedEntries.length,
      expected_screenshots: manifest.captures.length,
      completeness: orderedEntries.length === manifest.captures.length ? 'complete' : 'partial',
      themes: manifest.themes,
      viewports: manifest.viewports,
    },
    summary: {
      severity_counts: severityCounts,
      pixel_identical_groups: pixelIdenticalGroups.length,
      divergent_pixel_identical_groups: pixelIdenticalGroups.filter((group) => group.divergent)
        .length,
    },
    pixel_identical_groups: pixelIdenticalGroups,
    entries: orderedEntries,
  };
}

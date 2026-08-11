import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import {
  expectedCritiqueReviews,
  finalizeDesignCritique,
  PAGE_INVENTORY_REVIEW_CONTRACT,
  readCaptureManifest,
  StaleCritiqueHashError,
  validateCritiqueConsistency,
  validateCritiqueEntries,
} from './lib/page-inventory-data.mjs';
import { ROOT, isMain, runMain } from '../lib/proc.mjs';

export const CHECKPOINT_SCHEMA_VERSION = 3;
const MANIFEST_DEFAULT = join(ROOT, 'scrapbook/page-inventory/capture-manifest.json');
const CHECKPOINTS_DEFAULT = join(ROOT, '.scrapbook-scratch/page-inventory-critique/reviews');
const OUT_DEFAULT = join(ROOT, 'scrapbook/page-inventory/design-critique.json');
const SCRAPBOOK_ROOT = resolve(ROOT, 'scrapbook');

function options(argv) {
  const values = parseArgs({
    args: argv,
    options: {
      manifest: { type: 'string', default: MANIFEST_DEFAULT },
      checkpoints: { type: 'string', default: CHECKPOINTS_DEFAULT },
      out: { type: 'string', default: OUT_DEFAULT },
      'allow-partial': { type: 'boolean', default: false },
      status: { type: 'boolean', default: false },
    },
    strict: true,
  }).values;
  const out = resolve(ROOT, values.out);
  if (
    values['allow-partial'] &&
    (out === SCRAPBOOK_ROOT || out.startsWith(`${SCRAPBOOK_ROOT}${sep}`))
  ) {
    throw new Error('--allow-partial requires an explicit scratch --out path');
  }
  return {
    manifest: resolve(ROOT, values.manifest),
    checkpoints: resolve(ROOT, values.checkpoints),
    out,
    allowPartial: values['allow-partial'],
    status: values.status,
  };
}

function readCheckpoint(path) {
  let document;
  try {
    document = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`could not parse JSON: ${error.message}`, { cause: error });
  }
  if (document?.schema_version !== CHECKPOINT_SCHEMA_VERSION) {
    throw new Error(`schema_version must be ${CHECKPOINT_SCHEMA_VERSION}`);
  }
  if (document.review_contract !== PAGE_INVENTORY_REVIEW_CONTRACT) {
    throw new Error(`review_contract must be ${PAGE_INVENTORY_REVIEW_CONTRACT}`);
  }
  if (typeof document.review_id !== 'string' || !document.review_id) {
    throw new Error('review_id must be a string');
  }
  if (!document.entry || typeof document.entry !== 'object') {
    throw new Error('entry must be an object');
  }
  return document;
}

function validateCheckpoint(document, manifest, expectedReviews) {
  const expected = expectedReviews.get(document.review_id);
  if (!expected) throw new Error(`unknown review_id ${document.review_id}`);
  if (document.entry.review_id !== document.review_id) {
    throw new Error(`entry.review_id must equal ${document.review_id}`);
  }
  const entries = validateCritiqueEntries([document.entry], manifest, { allowPartial: true });
  if (!entries.has(expected.review_id)) throw new Error(`review is missing ${expected.review_id}`);
  return document.entry;
}

function checkpointWithCurrentHashes(document, manifest) {
  const captures = new Map(manifest.captures.map((capture) => [capture.review_id, capture]));
  const capture = captures.get(document?.review_id);
  return {
    ...document,
    entry: capture ? { ...document.entry, sha256: capture.sha256 } : document.entry,
  };
}

function loadCheckpointEntries(
  checkpoints,
  manifest,
  { allowPartial = false, reportStatus = false } = {}
) {
  if (!existsSync(checkpoints))
    throw new Error(`Checkpoint directory does not exist: ${checkpoints}`);
  const expectedReviews = expectedCritiqueReviews(manifest);
  const files = readdirSync(checkpoints)
    .filter((file) => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b));
  const errors = [];
  const encounteredReviews = new Set();
  const seenReviews = new Set();
  const staleReviews = new Set();
  const entries = [];
  for (const file of files) {
    let document;
    try {
      document = readCheckpoint(join(checkpoints, file));
      if (file !== `${document.review_id}.json`) {
        throw new Error(`filename must be ${document.review_id}.json`);
      }
      if (encounteredReviews.has(document.review_id)) {
        throw new Error(`duplicate review_id ${document.review_id}`);
      }
      encounteredReviews.add(document.review_id);
      const entry = validateCheckpoint(document, manifest, expectedReviews);
      seenReviews.add(document.review_id);
      entries.push(entry);
    } catch (error) {
      if (reportStatus && document && error instanceof StaleCritiqueHashError) {
        try {
          validateCheckpoint(
            checkpointWithCurrentHashes(document, manifest),
            manifest,
            expectedReviews
          );
          staleReviews.add(document.review_id);
          continue;
        } catch (normalizedError) {
          errors.push(`${file}: ${normalizedError.message}`);
          continue;
        }
      }
      errors.push(`${file}: ${error.message}`);
    }
  }
  if (errors.length) {
    throw new Error(
      `Invalid critique checkpoints:\n${errors.map((error) => `- ${error}`).join('\n')}`
    );
  }
  if (!allowPartial && seenReviews.size !== expectedReviews.size) {
    const missing = [...expectedReviews.keys()].find((key) => !seenReviews.has(key));
    throw new Error(
      `Critique has ${seenReviews.size} of ${expectedReviews.size} reviews; missing ${missing}`
    );
  }
  return {
    entries,
    completedReviewIds: seenReviews,
    staleReviewIds: staleReviews,
    completedReviews: seenReviews.size,
    expectedReviews: expectedReviews.size,
  };
}

function reviewRequest(capture) {
  return {
    review_id: capture.review_id,
    image: capture.image,
    sha256: capture.sha256,
    description: capture.review_description,
  };
}

function writeJsonAtomically(path, document) {
  mkdirSync(dirname(path), { recursive: true });
  const staging = mkdtempSync(join(dirname(path), `.${basename(path)}-staging-`));
  const candidate = join(staging, basename(path));
  try {
    writeFileSync(candidate, `${JSON.stringify(document, null, 2)}\n`);
    renameSync(candidate, path);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

export async function finalizePageInventoryCritique(argv = process.argv.slice(2)) {
  const { manifest: manifestPath, checkpoints, out, allowPartial, status } = options(argv);
  const manifest = readCaptureManifest(manifestPath);
  if (status) mkdirSync(checkpoints, { recursive: true });
  const loaded = loadCheckpointEntries(checkpoints, manifest, {
    allowPartial: status || allowPartial,
    reportStatus: status,
  });
  if (status) {
    validateCritiqueConsistency(loaded.entries, manifest, { allowPartial: true });
    const expectedReviews = expectedCritiqueReviews(manifest);
    const missing = [...expectedReviews.values()].filter(
      (capture) =>
        !loaded.completedReviewIds.has(capture.review_id) &&
        !loaded.staleReviewIds.has(capture.review_id)
    );
    const stale = [...loaded.staleReviewIds].map((reviewId) =>
      reviewRequest(expectedReviews.get(reviewId))
    );
    console.log(
      JSON.stringify(
        {
          completed_reviews: loaded.completedReviews,
          expected_reviews: loaded.expectedReviews,
          missing_reviews: missing.length,
          stale_reviews: stale.length,
          next_review: stale[0] ?? (missing[0] ? reviewRequest(missing[0]) : null),
          missing_review_ids: missing.map((capture) => capture.review_id),
          stale_review_ids: stale.map((capture) => capture.review_id),
        },
        null,
        2
      )
    );
    return;
  }
  const critique = finalizeDesignCritique(manifest, loaded.entries, { allowPartial });
  writeJsonAtomically(out, critique);
  console.log(
    `Finalized ${loaded.completedReviews} of ${loaded.expectedReviews} independent reviews to ${relative(ROOT, out)}`
  );
}

if (isMain(import.meta.url)) runMain(finalizePageInventoryCritique);
